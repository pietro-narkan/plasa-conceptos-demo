(() => {
  'use strict';

  const STORAGE_KEY = 'plasa-conceptos-public-demo-v1';
  const UI_KEY = 'plasa-conceptos-public-demo-ui-v1';
  const SCHEMA = 'plasa-conceptos-public-demo-v1';
  const seed = window.CONCEPT_SEED;
  const metaSnapshot = window.META_SNAPSHOT || { stores: [], currency: 'CLP' };

  const statusStyles = {
    idea: { color: '#94a3b8', text: '#475569' },
    draft: { color: '#64748b', text: '#475569' },
    ready: { color: '#0ea5e9', text: '#0369a1' },
    testing: { color: '#f59e0b', text: '#92400e' },
    winner: { color: '#10b981', text: '#047857' },
    scaling: { color: '#7c3aed', text: '#6d28d9' },
    paused: { color: '#78716c', text: '#57534e' },
    discarded: { color: '#e11d48', text: '#be123c' },
  };

  const kanbanColumns = [
    { id: 'preparation', title: 'Por preparar', statuses: ['idea', 'draft', 'ready'], dropStatus: 'draft', color: '#0ea5e9' },
    { id: 'testing', title: 'En prueba', statuses: ['testing'], dropStatus: 'testing', color: '#f59e0b' },
    { id: 'winning', title: 'Ganadores', statuses: ['winner', 'scaling'], dropStatus: 'winner', color: '#10b981' },
    { id: 'stopped', title: 'Detenidos', statuses: ['paused', 'discarded'], dropStatus: 'paused', color: '#78716c' },
  ];

  const decisions = [
    { id: '', label: 'Sin decisión todavía' },
    { id: 'iterate', label: 'Iterar el concepto' },
    { id: 'winner', label: 'Marcar como ganador' },
    { id: 'scale', label: 'Escalar nuevas ejecuciones' },
    { id: 'pause', label: 'Pausar temporalmente' },
    { id: 'discard', label: 'Descartar con aprendizaje' },
  ];

  const noteTypes = {
    internal: 'Nota interna',
    client: 'Visible al cliente',
    decision: 'Decisión',
    strategy: 'Estrategia',
    warning: 'Validación pendiente',
    source: 'Fuente',
    model: 'Modelo',
    status: 'Cambio de estado',
    meta: 'Asociación Meta',
  };

  const derivationLabels = {
    hook: 'Hook',
    persona: 'Persona',
    offer: 'Oferta',
    angle: 'Ángulo',
    format: 'Formato',
    creative: 'Hook / formato',
  };

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const deepClone = (value) => JSON.parse(JSON.stringify(value));
  const uid = (prefix = 'item') => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  const escapeHTML = (value = '') => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const money = new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: metaSnapshot.currency || 'CLP',
    maximumFractionDigits: 0,
  });
  const number = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
  const decimal = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let state = loadState();
  let ui = loadUi();
  let saveTimer = null;
  let viewRenderTimer = null;
  let conceptMapFrame = null;
  let conceptMapResizeObserver = null;
  let lastFocused = null;
  let lastDeleted = null;

  const els = {};

  function loadState() {
    if (!seed?.clients?.length) return { version: '0', statuses: [], clients: [] };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved?.schema === SCHEMA && saved?.data?.clients?.length) return normalizeState(saved.data);
    } catch (error) {
      console.warn('No se pudo leer el estado local:', error);
    }
    return normalizeState(deepClone(seed));
  }

  function normalizeState(data) {
    data.statuses = deepClone(seed.statuses);
    data.clients = (data.clients || []).map((client) => ({
      ...client,
      storeId: client.storeId == null ? null : String(client.storeId),
      products: client.products || [],
      concepts: (client.concepts || []).map((concept) => ({
        ...concept,
        status: statusStyles[concept.status] ? concept.status : 'draft',
        metaLinks: concept.metaLinks || [],
        executions: (concept.executions || []).map((execution) => ({
          ...execution,
          hookVariants: execution.hookVariants || [],
          scenes: execution.scenes || [],
          references: execution.references || [],
          metaLinks: execution.metaLinks || [],
        })),
        notes: concept.notes || [],
        history: concept.history || [],
        derivationChanges: concept.derivationChanges || {},
        derivationNote: concept.derivationNote || '',
      })),
    }));
    return data;
  }

  function loadUi() {
    const fallback = {
      selectedClientId: seed?.clients?.[0]?.id || null,
      selectedProductId: 'all',
      status: 'all',
      search: '',
      clientSearch: '',
      mode: 'conceptual',
      conceptMapIntroduced: true,
      manualBuilderIntroduced: true,
      collapsedMapNodeIds: [],
      view: 'map',
      dateRange: 30,
      inspectorConceptId: null,
      inspectorTab: 'strategy',
      simpleEditorSection: null,
    };
    try {
      const saved = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
      const loaded = { ...fallback, ...(saved || {}), inspectorConceptId: null };
      if (!saved?.conceptMapIntroduced) {
        loaded.mode = 'conceptual';
        loaded.conceptMapIntroduced = true;
      }
      if (!saved?.manualBuilderIntroduced) {
        loaded.mode = 'conceptual';
        loaded.manualBuilderIntroduced = true;
      }
      if (!Array.isArray(loaded.collapsedMapNodeIds)) loaded.collapsedMapNodeIds = [];
      if (![null, 'context', 'creative', 'test', 'history'].includes(loaded.simpleEditorSection)) loaded.simpleEditorSection = null;
      return loaded;
    } catch {
      return fallback;
    }
  }

  function saveNow({ feedback = false } = {}) {
    clearTimeout(saveTimer);
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: SCHEMA, data: state }));
    localStorage.setItem(UI_KEY, JSON.stringify(ui));
    updateAutosave(false);
    if (feedback) showToast('Cambios guardados', 'El prototipo se actualizó en este navegador.', 'success');
  }

  function scheduleSave() {
    updateAutosave(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow(), 320);
  }

  function scheduleViewRender() {
    clearTimeout(viewRenderTimer);
    viewRenderTimer = setTimeout(() => {
      renderClientSummary();
      renderKpis();
      renderSimpleSummary();
      renderView();
      renderSimpleView();
      renderClientList();
      renderSimpleClientList();
      renderProductFilters();
      renderSimpleFilters();
    }, 120);
  }

  function cacheElements() {
    Object.assign(els, {
      clientList: $('#clientList'),
      clientCount: $('#clientCount'),
      clientSearch: $('#clientSearch'),
      simpleWorkspace: $('#simpleWorkspace'),
      advancedWorkspace: $('#advancedWorkspace'),
      simpleClientList: $('#simpleClientList'),
      simpleInboxTitle: $('#simpleInboxTitle'),
      simpleResultCount: $('#simpleResultCount'),
      simpleConceptSearch: $('#simpleConceptSearch'),
      simpleProductFilter: $('#simpleProductFilter'),
      simpleStatusFilter: $('#simpleStatusFilter'),
      simpleViewRoot: $('#simpleViewRoot'),
      conceptEditorSlot: $('#conceptEditorSlot'),
      conceptEditorEmpty: $('#conceptEditorEmpty'),
      productFilters: $('#productFilters'),
      statusFilter: $('#statusFilter'),
      conceptSearch: $('#conceptSearch'),
      dateRange: $('#dateRange'),
      clientSummary: $('#clientSummary'),
      kpiGrid: $('#kpiGrid'),
      viewRoot: $('#viewRoot'),
      mapLegend: $('#mapLegend'),
      inspector: $('#inspector'),
      inspectorBody: $('#inspectorBody'),
      inspectorTitle: $('#inspectorTitle'),
      inspectorClient: $('#inspectorClient'),
      inspectorProduct: $('#inspectorProduct'),
      drawerBackdrop: $('#drawerBackdrop'),
      quickStatus: $('#quickStatus'),
      creativeCountBadge: $('#creativeCountBadge'),
      metaCountBadge: $('#metaCountBadge'),
      autosaveState: $('#autosaveState'),
      dialog: $('#conceptDialog'),
      form: $('#conceptForm'),
      newClientContext: $('#newClientContext'),
      deriveDialog: $('#deriveDialog'),
      deriveForm: $('#deriveForm'),
      deriveSource: $('#deriveSource'),
      deriveError: $('#deriveError'),
      newConceptBtn: $('#newConceptBtn'),
      importInput: $('#importInput'),
      toastRegion: $('#toastRegion'),
      snapshotState: $('#snapshotState'),
      pageTitle: $('#pageTitle'),
      pageDescription: $('#pageDescription'),
    });
  }

  function init() {
    cacheElements();
    if (!state.clients.length) {
      els.viewRoot.innerHTML = renderEmpty('No hay datos iniciales', 'No se pudo leer seed-data.js.', 'i-alert');
      return;
    }
    if (!state.clients.some((client) => client.id === ui.selectedClientId)) ui.selectedClientId = state.clients[0].id;
    renderStaticOptions();
    bindEvents();
    renderAll();
    updateSnapshotLabel();
  }

  function renderStaticOptions() {
    const options = state.statuses.map((status) => `<option value="${escapeHTML(status.id)}">${escapeHTML(status.label)}</option>`).join('');
    els.statusFilter.innerHTML = `<option value="all">Todos los estados</option>${options}`;
    els.simpleStatusFilter.innerHTML = `<option value="all">Todos los estados</option>${options}`;
    els.quickStatus.innerHTML = options;
    $('#newStatus').innerHTML = options;
    els.statusFilter.value = ui.status;
    els.conceptSearch.value = ui.search;
    els.clientSearch.value = ui.clientSearch;
    els.simpleConceptSearch.value = ui.search;
    els.dateRange.value = String(ui.dateRange);
  }

  function renderAll() {
    renderMode();
    renderClientList();
    renderSimpleClientList();
    renderProductFilters();
    renderSimpleFilters();
    renderClientSummary();
    renderKpis();
    renderSimpleSummary();
    renderViewTabs();
    renderView();
    renderSimpleView();
    if (ui.inspectorConceptId) renderInspector();
  }

  function getClient(id = ui.selectedClientId) {
    return state.clients.find((client) => client.id === id) || state.clients[0];
  }

  function findConcept(id) {
    for (const client of state.clients) {
      const concept = client.concepts.find((item) => item.id === id);
      if (concept) return { client, concept };
    }
    return null;
  }

  function getProduct(client, productId) {
    return client?.products?.find((product) => product.id === productId) || null;
  }

  function getTerritory(client, productId, territoryId) {
    return getProduct(client, productId)?.territories?.find((territory) => territory.id === territoryId) || null;
  }

  function getStatus(id) {
    return state.statuses.find((status) => status.id === id) || { id, label: id || 'Sin estado' };
  }

  function getMetaStore(client) {
    return metaSnapshot.stores?.find((store) => String(store.storeId) === String(client?.storeId)) || null;
  }

  function initials(name = '') {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '??';
  }

  function renderMode() {
    ui.mode = ['simple', 'conceptual', 'advanced'].includes(ui.mode) ? ui.mode : 'conceptual';
    const sharedWorkspace = ui.mode !== 'advanced';
    document.body.dataset.interfaceMode = ui.mode;
    els.simpleWorkspace.hidden = !sharedWorkspace;
    els.advancedWorkspace.hidden = sharedWorkspace;
    if (ui.mode === 'simple') {
      els.pageTitle.textContent = 'Conceptos';
      els.pageDescription.textContent = 'Mueve los conceptos por etapas y abre una tarjeta cuando necesites trabajar el detalle.';
      els.simpleWorkspace.setAttribute('aria-label', 'Kanban de conceptos');
      els.newConceptBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-plus" /></svg>Nuevo concepto';
    } else if (ui.mode === 'conceptual') {
      els.pageTitle.textContent = 'Constructor de conceptos';
      els.pageDescription.textContent = 'Crea una idea base y deriva ramas personalizadas sin perder su origen.';
      els.simpleWorkspace.setAttribute('aria-label', 'Constructor manual de conceptos');
      els.newConceptBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-plus" /></svg>Concepto base';
    } else {
      els.pageTitle.textContent = 'Análisis de conceptos';
      els.pageDescription.textContent = 'Revisa territorios, ejecuciones y resultados cuando necesites más profundidad.';
      els.newConceptBtn.innerHTML = '<svg aria-hidden="true"><use href="#i-plus" /></svg>Nuevo concepto';
    }
    $$('[data-mode]').forEach((button) => {
      const active = button.dataset.mode === ui.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    mountInspectorForMode();
  }

  function mountInspectorForMode() {
    const embedded = ui.mode === 'conceptual';
    const wasEmbedded = els.inspector.classList.contains('embedded');
    if (embedded) {
      if (els.inspector.parentElement !== els.conceptEditorSlot) els.conceptEditorSlot.append(els.inspector);
      els.inspector.classList.add('embedded');
      syncEmbeddedInspectorVisibility();
      return;
    }
    if (wasEmbedded) {
      ui.inspectorConceptId = null;
      ui.simpleEditorSection = null;
    }
    setSimpleInspectorMenu(false);
    if (els.inspector.parentElement === els.conceptEditorSlot) document.body.append(els.inspector);
    els.inspector.classList.remove('embedded', 'open');
    els.inspector.setAttribute('aria-hidden', 'true');
    els.conceptEditorSlot.classList.remove('has-selection');
    els.drawerBackdrop.classList.remove('visible');
    els.drawerBackdrop.hidden = true;
  }

  function syncEmbeddedInspectorVisibility() {
    if (ui.mode !== 'conceptual') return;
    const found = findConcept(ui.inspectorConceptId);
    const hasSelection = Boolean(found && found.client.id === ui.selectedClientId);
    els.conceptEditorSlot.classList.toggle('has-selection', hasSelection);
    els.inspector.classList.toggle('open', hasSelection);
    els.inspector.setAttribute('aria-hidden', String(!hasSelection));
  }

  function renderSimpleClientList() {
    els.simpleClientList.innerHTML = state.clients.map((client) => `
      <button class="simple-client-option ${client.id === ui.selectedClientId ? 'active' : ''}" type="button" data-simple-client-id="${escapeHTML(client.id)}" style="--client-color:${escapeHTML(client.color || '#7c3aed')}" aria-pressed="${client.id === ui.selectedClientId}">
        <span class="simple-client-avatar">${escapeHTML(initials(client.name))}</span>
        <span><strong>${escapeHTML(client.name)}</strong></span>
      </button>`).join('');
  }

  function renderSimpleFilters() {
    const client = getClient();
    const products = [{ id: 'all', name: 'Todos los productos', count: client.concepts.length }, ...client.products.map((product) => ({
      id: product.id,
      name: product.name,
      count: client.concepts.filter((concept) => concept.productId === product.id).length,
    }))];
    if (!products.some((product) => product.id === ui.selectedProductId)) ui.selectedProductId = 'all';
    els.simpleProductFilter.innerHTML = products.map((product) => `<option value="${escapeHTML(product.id)}">${escapeHTML(product.name)} (${product.count})</option>`).join('');
    els.simpleProductFilter.value = ui.selectedProductId;
    els.simpleStatusFilter.value = ui.status;
    els.simpleConceptSearch.value = ui.search;
  }

  function renderSimpleSummary() {
    const client = getClient();
    els.simpleInboxTitle.textContent = ui.mode === 'conceptual' ? `Taller de ${client.name}` : `Tablero de ${client.name}`;
  }

  function renderSimpleView() {
    if (ui.mode === 'conceptual') {
      renderConceptBuilderView();
      return;
    }
    const client = getClient();
    const concepts = visibleConcepts(client);
    els.simpleResultCount.textContent = `${concepts.length} ${concepts.length === 1 ? 'concepto' : 'conceptos'}`;
    if (!concepts.length) {
      els.simpleViewRoot.innerHTML = `
        <div class="simple-empty">
          <span class="simple-empty-icon"><svg aria-hidden="true"><use href="#i-search" /></svg></span>
          <h3>Sin coincidencias</h3>
          <p>Prueba con otro producto, estado o término de búsqueda.</p>
          <button class="button secondary" type="button" data-clear-simple-filters>Limpiar filtros</button>
        </div>`;
      return;
    }
    els.simpleViewRoot.innerHTML = `
      <div class="kanban-board" role="region" aria-label="Flujo de conceptos">
        ${kanbanColumns.map((column) => renderKanbanColumn(client, concepts, column)).join('')}
      </div>`;
  }

  function renderKanbanColumn(client, concepts, column) {
    const items = concepts.filter((concept) => column.statuses.includes(concept.status));
    return `
      <section class="kanban-column" data-drop-status="${escapeHTML(column.dropStatus)}" data-kanban-stage="${escapeHTML(column.id)}" style="--column-color:${column.color}" aria-labelledby="kanban-${escapeHTML(column.id)}">
        <header class="kanban-column-header">
          <span><i aria-hidden="true"></i><h3 id="kanban-${escapeHTML(column.id)}">${escapeHTML(column.title)}</h3></span>
          <strong>${items.length}</strong>
        </header>
        <div class="kanban-cards">
          ${items.length ? items.map((concept) => renderKanbanCard(client, concept)).join('') : '<div class="kanban-empty"><span>Sin conceptos</span><small>Arrastra una tarjeta aquí</small></div>'}
        </div>
      </section>`;
  }

  function kanbanStageIndex(status) {
    const index = kanbanColumns.findIndex((column) => column.statuses.includes(status));
    return index >= 0 ? index : kanbanColumns.length;
  }

  function renderKanbanCard(client, concept) {
    const product = getProduct(client, concept.productId);
    const status = getStatus(concept.status);
    const style = statusStyles[concept.status] || statusStyles.draft;
    const metrics = conceptMetrics(client, concept);
    const stageIndex = kanbanStageIndex(concept.status);
    const previousStatus = stageIndex > 0 ? kanbanColumns[stageIndex - 1].dropStatus : null;
    const nextStatus = stageIndex < kanbanColumns.length - 1 ? kanbanColumns[stageIndex + 1].dropStatus : null;
    const resultValue = metrics?.roas ? `${decimal.format(metrics.roas)}x` : metrics?.messages ? number.format(metrics.messages) : '—';
    const resultLabel = metrics?.roas ? 'ROAS' : metrics?.messages ? 'mensajes' : 'Sin resultado';
    return `
      <article class="kanban-card" data-drag-concept="${escapeHTML(concept.id)}" style="--status-color:${style.color};--status-text:${style.text}">
        <div class="kanban-card-top"><span class="status-badge">${escapeHTML(status.label)}</span><span class="kanban-drag-hint" draggable="true" title="Arrastrar tarjeta"><svg aria-hidden="true"><use href="#i-dots" /></svg></span></div>
        <button class="kanban-card-main" type="button" data-concept-id="${escapeHTML(concept.id)}">
          <strong>${escapeHTML(concept.title)}</strong>
          <small>${escapeHTML(product?.name || 'Producto')}</small>
        </button>
        <div class="kanban-card-stats">
          <span><svg aria-hidden="true"><use href="#i-image" /></svg>${concept.executions.length}</span>
          <span class="${metrics ? 'positive' : ''}"><strong>${escapeHTML(resultValue)}</strong><small>${escapeHTML(resultLabel)}</small></span>
        </div>
        <div class="kanban-card-actions" aria-label="Mover concepto">
          <button type="button" data-move-concept="${escapeHTML(concept.id)}" data-move-status="${escapeHTML(previousStatus || '')}" ${previousStatus ? '' : 'disabled'} aria-label="Mover ${escapeHTML(concept.title)} a la etapa anterior"><svg aria-hidden="true"><use href="#i-chevron" /></svg></button>
          <button type="button" data-move-concept="${escapeHTML(concept.id)}" data-move-status="${escapeHTML(nextStatus || '')}" ${nextStatus ? '' : 'disabled'} aria-label="Mover ${escapeHTML(concept.title)} a la etapa siguiente"><svg aria-hidden="true"><use href="#i-chevron" /></svg></button>
        </div>
      </article>`;
  }

  function renderConceptBuilderView() {
    const client = getClient();
    const previousInspectorConceptId = ui.inspectorConceptId;
    const editorHasFocus = Boolean(els.inspector?.contains(document.activeElement));
    const productFilter = ui.selectedProductId === 'all' ? null : ui.selectedProductId;
    const directMatches = visibleConcepts(client);
    const directIds = new Set(directMatches.map((concept) => concept.id));
    const hasFilters = ui.status !== 'all' || Boolean((ui.search || '').trim());
    const products = client.products.filter((product) => !productFilter || product.id === productFilter);
    const models = products.map((product) => buildCascadeProductModel(client, product, directIds, hasFilters));
    const visibleModels = hasFilters ? models.filter((model) => model.concepts.length) : models;
    const displayedConcepts = visibleModels.flatMap((model) => model.concepts);
    const displayedConceptIds = new Set(displayedConcepts.map((concept) => concept.id));
    const selection = findConcept(ui.inspectorConceptId);
    const selectionOutsideView = !selection
      || selection.client.id !== client.id
      || !displayedConceptIds.has(selection.concept.id);
    if (selectionOutsideView && displayedConcepts.length) {
      ui.inspectorConceptId = displayedConcepts[0].id;
      ui.inspectorTab = 'strategy';
      ui.simpleEditorSection = null;
    } else if (selectionOutsideView && !displayedConcepts.length) {
      ui.inspectorConceptId = null;
      ui.simpleEditorSection = null;
    }

    const selectedProduct = productFilter ? getProduct(client, productFilter) : null;
    const countLabel = hasFilters
      ? `${directMatches.length} ${directMatches.length === 1 ? 'resultado' : 'resultados'}`
      : `${displayedConcepts.length} ${displayedConcepts.length === 1 ? 'concepto' : 'conceptos'}`;
    els.simpleResultCount.textContent = countLabel;
    els.simpleViewRoot.innerHTML = `
      <section class="cascade-pane" aria-label="Mapa en cascada de ${escapeHTML(client.name)}">
        <header class="cascade-header">
          <div class="cascade-header-title"><div><p class="section-kicker">Mapa en cascada</p><h3>${escapeHTML(client.name)}</h3></div><span>${escapeHTML(countLabel)}</span></div>
          <label class="cascade-select-field"><span>Cliente</span><select data-cascade-client aria-label="Cliente del mapa">${state.clients.map((item) => `<option value="${escapeHTML(item.id)}" ${selected(item.id, client.id)}>${escapeHTML(item.name)}</option>`).join('')}</select><svg aria-hidden="true"><use href="#i-chevron" /></svg></label>
          <div class="cascade-filter-row">
            <label class="cascade-select-field"><span>Producto</span><select data-cascade-product aria-label="Producto del mapa"><option value="all">Todos los productos</option>${client.products.map((product) => `<option value="${escapeHTML(product.id)}" ${selected(product.id, ui.selectedProductId)}>${escapeHTML(product.name)}</option>`).join('')}</select><svg aria-hidden="true"><use href="#i-chevron" /></svg></label>
            <label class="cascade-select-field"><span>Estado</span><select data-cascade-status aria-label="Estado de conceptos"><option value="all">Todos</option>${state.statuses.map((status) => `<option value="${escapeHTML(status.id)}" ${selected(status.id, ui.status)}>${escapeHTML(status.label)}</option>`).join('')}</select><svg aria-hidden="true"><use href="#i-chevron" /></svg></label>
          </div>
          <label class="cascade-search"><svg aria-hidden="true"><use href="#i-search" /></svg><span class="sr-only">Buscar en la cascada</span><input type="search" value="${escapeHTML(ui.search || '')}" data-cascade-search placeholder="Buscar concepto, persona o ángulo" autocomplete="off" /></label>
        </header>
        <div class="cascade-tree-scroll">
          <div class="cascade-client-root" style="--client-color:${escapeHTML(client.color || '#7c3aed')}">
            <span>${escapeHTML(initials(client.name))}</span><div><small>Cliente raíz</small><strong>${escapeHTML(client.name)}</strong></div>
          </div>
          <div class="cascade-product-list" role="tree" aria-label="Productos, conceptos y derivaciones">
            ${visibleModels.length
              ? visibleModels.map((model) => renderCascadeProductGroup(client, model, directIds)).join('')
              : `<div class="cascade-no-results"><svg aria-hidden="true"><use href="#i-search" /></svg><strong>Sin coincidencias</strong><p>Prueba otro producto, estado o búsqueda.</p><button class="button secondary small" type="button" data-clear-simple-filters>Limpiar filtros</button></div>`}
          </div>
        </div>
        <footer class="cascade-footer"><button class="button primary" type="button" data-empty-add="${escapeHTML(selectedProduct?.id || '')}"><svg aria-hidden="true"><use href="#i-plus" /></svg>Nuevo concepto base</button><small>Se guardará sólo en este navegador.</small></footer>
      </section>`;
    syncEmbeddedInspectorVisibility();
    const selectionChanged = previousInspectorConceptId !== ui.inspectorConceptId;
    if (ui.inspectorConceptId && (!editorHasFocus || selectionChanged)) renderInspector();
  }

  function buildCascadeProductModel(client, product, directIds, hasFilters) {
    const allConcepts = client.concepts.filter((concept) => concept.productId === product.id);
    const byId = new Map(allConcepts.map((concept) => [concept.id, concept]));
    const includedIds = new Set(allConcepts.filter((concept) => directIds.has(concept.id)).map((concept) => concept.id));
    if (hasFilters) {
      [...includedIds].forEach((conceptId) => {
        let parentId = byId.get(conceptId)?.derivedFrom;
        const guard = new Set([conceptId]);
        while (parentId && byId.has(parentId) && !guard.has(parentId)) {
          includedIds.add(parentId);
          guard.add(parentId);
          parentId = byId.get(parentId)?.derivedFrom;
        }
      });
    }
    const concepts = hasFilters ? allConcepts.filter((concept) => includedIds.has(concept.id)) : allConcepts;
    const scopedIds = new Set(concepts.map((concept) => concept.id));
    const childrenByParent = new Map();
    const roots = [];
    concepts.forEach((concept) => {
      if (concept.derivedFrom && concept.derivedFrom !== concept.id && scopedIds.has(concept.derivedFrom)) {
        if (!childrenByParent.has(concept.derivedFrom)) childrenByParent.set(concept.derivedFrom, []);
        childrenByParent.get(concept.derivedFrom).push(concept);
      } else roots.push(concept);
    });
    const sortItems = (items) => items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'es'));
    sortItems(roots);
    childrenByParent.forEach(sortItems);
    return { product, concepts, roots, childrenByParent, total: allConcepts.length };
  }

  function renderCascadeProductGroup(client, model, directIds) {
    const { product, concepts, roots, childrenByParent, total } = model;
    const collapseId = `cascade-product:${product.id}`;
    const collapsed = ui.collapsedMapNodeIds.includes(collapseId);
    const visited = new Set();
    let branches = roots.map((concept) => renderCascadeConceptBranch(client, concept, childrenByParent, directIds, visited, new Set())).join('');
    concepts.forEach((concept) => {
      if (!visited.has(concept.id)) branches += renderCascadeConceptBranch(client, concept, childrenByParent, directIds, visited, new Set(), true);
    });
    return `
      <section class="cascade-product ${concepts.some((concept) => concept.id === ui.inspectorConceptId) ? 'contains-selection' : ''}" aria-labelledby="cascade-product-${escapeHTML(product.id)}">
        <div class="cascade-product-heading">
          <button type="button" data-map-toggle="${escapeHTML(collapseId)}" aria-expanded="${String(!collapsed)}" aria-controls="cascade-product-tree-${escapeHTML(product.id)}"><svg aria-hidden="true"><use href="#i-chevron" /></svg><span><small>Producto</small><strong id="cascade-product-${escapeHTML(product.id)}">${escapeHTML(product.name)}</strong></span><em>${concepts.length}/${total}</em></button>
          <button type="button" data-empty-add="${escapeHTML(product.id)}" aria-label="Crear concepto base para ${escapeHTML(product.name)}"><svg aria-hidden="true"><use href="#i-plus" /></svg></button>
        </div>
        <ul id="cascade-product-tree-${escapeHTML(product.id)}" class="cascade-concept-tree" role="group" ${collapsed ? 'hidden' : ''}>
          ${branches || `<li class="cascade-product-empty"><span>Sin conceptos todavía</span><button type="button" data-empty-add="${escapeHTML(product.id)}">Crear el primero</button></li>`}
        </ul>
      </section>`;
  }

  function renderCascadeConceptBranch(client, concept, childrenByParent, directIds, visited, ancestry, cycleFallback = false) {
    if (ancestry.has(concept.id)) return `<li class="cascade-cycle"><svg aria-hidden="true"><use href="#i-alert" /></svg>Ciclo de origen detectado</li>`;
    visited.add(concept.id);
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(concept.id);
    const children = childrenByParent.get(concept.id) || [];
    const collapseId = `cascade-concept:${concept.id}`;
    const collapsed = ui.collapsedMapNodeIds.includes(collapseId);
    const selectedConcept = concept.id === ui.inspectorConceptId;
    const product = getProduct(client, concept.productId);
    const territory = getTerritory(client, concept.productId, concept.territoryId);
    const status = getStatus(concept.status);
    const style = statusStyles[concept.status] || statusStyles.draft;
    const parent = concept.derivedFrom ? findConcept(concept.derivedFrom) : null;
    const changes = [...new Set(Object.entries(concept.derivationChanges || {}).filter(([, value]) => value).map(([field]) => derivationLabels[field] || field))];
    return `
      <li class="cascade-concept-branch ${selectedConcept ? 'selected' : ''} ${directIds.has(concept.id) ? '' : 'context-only'}" role="treeitem" aria-selected="${String(selectedConcept)}">
        <div class="cascade-concept-row">
          <button class="cascade-concept-node" type="button" data-concept-id="${escapeHTML(concept.id)}" aria-current="${selectedConcept ? 'true' : 'false'}">
            <i style="--node-color:${escapeHTML(parent ? '#0f766e' : style.color)}" aria-hidden="true"></i>
            <span><small>${parent ? `Derivación${changes.length ? ` · ${escapeHTML(changes.join(' + '))}` : ''}` : 'Concepto base'}</small><strong data-cascade-title="${escapeHTML(concept.id)}">${escapeHTML(concept.title)}</strong><em>${escapeHTML(territory?.name || product?.name || status.label)}</em></span>
            <b style="--status-color:${escapeHTML(style.color)}">${escapeHTML(status.label)}</b>
          </button>
          ${children.length ? `<button class="cascade-collapse" type="button" data-map-toggle="${escapeHTML(collapseId)}" aria-expanded="${String(!collapsed)}" aria-label="${collapsed ? 'Expandir' : 'Contraer'} ramas de ${escapeHTML(concept.title)}"><svg aria-hidden="true"><use href="#i-chevron" /></svg></button>` : ''}
        </div>
        ${cycleFallback ? '<p class="cascade-origin-warning"><svg aria-hidden="true"><use href="#i-alert" /></svg>Origen no disponible</p>' : ''}
        ${children.length ? `<ul class="cascade-children" role="group" ${collapsed ? 'hidden' : ''}>${children.map((child) => renderCascadeConceptBranch(client, child, childrenByParent, directIds, visited, nextAncestry)).join('')}</ul>` : ''}
      </li>`;
  }

  function renderHorizontalConceptBuilderView() {
    const client = getClient();
    const store = getMetaStore(client);
    const productId = ui.selectedProductId === 'all' ? null : ui.selectedProductId;
    const allScoped = client.concepts.filter((concept) => !productId || concept.productId === productId);
    const directMatches = visibleConcepts(client);
    const directIds = new Set(directMatches.map((concept) => concept.id));
    const byId = new Map(allScoped.map((concept) => [concept.id, concept]));
    const hasFilters = ui.status !== 'all' || Boolean((ui.search || '').trim());
    const includedIds = new Set(directIds);

    if (hasFilters) {
      directMatches.forEach((concept) => {
        let parentId = concept.derivedFrom;
        const guard = new Set([concept.id]);
        while (parentId && byId.has(parentId) && !guard.has(parentId)) {
          includedIds.add(parentId);
          guard.add(parentId);
          parentId = byId.get(parentId)?.derivedFrom;
        }
      });
    }

    const concepts = hasFilters ? allScoped.filter((concept) => includedIds.has(concept.id)) : allScoped;
    const scopedIds = new Set(concepts.map((concept) => concept.id));
    const childrenByParent = new Map();
    const roots = [];
    concepts.forEach((concept) => {
      if (concept.derivedFrom && concept.derivedFrom !== concept.id && scopedIds.has(concept.derivedFrom)) {
        if (!childrenByParent.has(concept.derivedFrom)) childrenByParent.set(concept.derivedFrom, []);
        childrenByParent.get(concept.derivedFrom).push(concept);
      } else {
        roots.push(concept);
      }
    });

    const sortConcepts = (items) => items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'es'));
    sortConcepts(roots);
    childrenByParent.forEach(sortConcepts);
    const visited = new Set();
    let branchMarkup = roots.map((concept) => renderBuilderConceptBranch(client, concept, childrenByParent, visited, new Set(), `client:${client.id}`, directIds)).join('');
    concepts.forEach((concept) => {
      if (!visited.has(concept.id)) branchMarkup += renderBuilderConceptBranch(client, concept, childrenByParent, visited, new Set(), `client:${client.id}`, directIds, true);
    });

    const selectedProduct = productId ? getProduct(client, productId) : null;
    const countLabel = hasFilters
      ? `${directMatches.length} visibles · ${concepts.length} con contexto`
      : `${concepts.length} ${concepts.length === 1 ? 'concepto' : 'conceptos'}`;
    els.simpleResultCount.textContent = countLabel;
    els.simpleViewRoot.innerHTML = `
      <div class="concept-builder-view">
        <header class="builder-guide">
          <div class="builder-guide-copy">
            <span class="builder-step-number" aria-hidden="true">3</span>
            <div><strong>Construye desde una idea base</strong><p>Cada derivación hereda el contexto y registra únicamente qué decidiste cambiar.</p></div>
          </div>
          <button class="button primary builder-new-root" type="button" data-empty-add="${escapeHTML(productId || '')}"><svg aria-hidden="true"><use href="#i-plus" /></svg>Crear concepto base</button>
        </header>
        <div class="builder-scroll" tabindex="0" aria-label="Lienzo manual de ${escapeHTML(client.name)}">
          <div class="builder-canvas" data-map-canvas>
            <svg class="concept-map-links builder-links" data-map-links aria-hidden="true"></svg>
            <div class="builder-tree">
              <article class="builder-client-card" data-map-node="client:${escapeHTML(client.id)}" data-map-kind="client" style="--client-color:${escapeHTML(client.color || '#7c3aed')}">
                <span class="builder-node-kicker">Raíz del lienzo</span>
                <div class="builder-client-identity"><span>${escapeHTML(initials(client.name))}</span><div><strong>${escapeHTML(client.name)}</strong><small>${selectedProduct ? escapeHTML(selectedProduct.name) : 'Todos los productos'}</small></div></div>
                <p>Todo lo que crees aquí pertenece a este cliente.</p>
                <span class="builder-connection-state ${store ? 'connected' : ''}"><svg aria-hidden="true"><use href="#i-meta" /></svg>${store ? 'Datos de Meta disponibles' : 'Meta pendiente de asociación'}</span>
              </article>
              <ul class="builder-forest" aria-label="Conceptos y derivaciones">
                ${branchMarkup}
                <li class="builder-concept-branch builder-add-branch">
                  <button class="builder-add-card" type="button" data-map-node="empty:${escapeHTML(client.id)}:${escapeHTML(productId || 'all')}" data-map-parent="client:${escapeHTML(client.id)}" data-map-kind="empty" data-empty-add="${escapeHTML(productId || '')}">
                    <span><svg aria-hidden="true"><use href="#i-plus" /></svg></span>
                    <strong>Nuevo concepto base</strong>
                    <small>${selectedProduct ? `Crear para ${escapeHTML(selectedProduct.name)}` : 'El producto se elige al crear'}</small>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>`;
    scheduleConceptMapConnections();
  }

  function renderBuilderConceptBranch(client, concept, childrenByParent, visited, ancestry, parentNodeId, directIds, cycleFallback = false) {
    if (ancestry.has(concept.id)) {
      return `<li class="builder-cycle-warning"><svg aria-hidden="true"><use href="#i-alert" /></svg><span>No se puede dibujar esta rama porque su origen forma un ciclo.</span></li>`;
    }
    visited.add(concept.id);
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(concept.id);
    const children = childrenByParent.get(concept.id) || [];
    const collapseId = `builder:${concept.id}`;
    const collapsed = ui.collapsedMapNodeIds.includes(collapseId);
    return `
      <li class="builder-concept-branch ${directIds.has(concept.id) ? '' : 'context-only'}">
        ${renderBuilderConceptCard(client, concept, parentNodeId, children.length, collapsed, collapseId, cycleFallback)}
        ${children.length ? `<ul class="builder-children" ${collapsed ? 'hidden' : ''}>${children.map((child) => renderBuilderConceptBranch(client, child, childrenByParent, visited, nextAncestry, `concept:${concept.id}`, directIds)).join('')}</ul>` : ''}
      </li>`;
  }

  function renderBuilderConceptCard(client, concept, parentNodeId, childCount, collapsed, collapseId, cycleFallback) {
    const product = getProduct(client, concept.productId);
    const territory = getTerritory(client, concept.productId, concept.territoryId);
    const status = getStatus(concept.status);
    const style = statusStyles[concept.status] || statusStyles.draft;
    const parent = concept.derivedFrom ? findConcept(concept.derivedFrom) : null;
    const changeLabels = [...new Set(Object.entries(concept.derivationChanges || {})
      .filter(([, changed]) => changed)
      .map(([field]) => derivationLabels[field] || field))];
    const metaCount = new Set([
      ...(concept.metaLinks || []),
      ...(concept.executions || []).flatMap((execution) => execution.metaLinks || []),
    ].map((link) => `${link.type}:${link.id}`)).size;
    const cardLabel = parent
      ? `${concept.title}, derivado de ${parent.concept.title}`
      : `${concept.title}, concepto base`;
    return `
      <article class="builder-concept-card ${parent ? 'derived' : 'base'}" data-map-node="concept:${escapeHTML(concept.id)}" data-map-parent="${escapeHTML(parentNodeId)}" data-map-kind="concept" style="--status-color:${style.color};--status-text:${style.text}">
        <header class="builder-card-header">
          <span class="builder-card-kind"><svg aria-hidden="true"><use href="#${parent ? 'i-branch' : 'i-bulb'}" /></svg>${parent ? 'Derivación' : 'Concepto base'}</span>
          <span class="status-badge">${escapeHTML(status.label)}</span>
        </header>
        <button class="builder-card-main" type="button" data-concept-id="${escapeHTML(concept.id)}" aria-label="Abrir ${escapeHTML(cardLabel)}">
          <strong>${escapeHTML(concept.title)}</strong>
          <span class="builder-context-chips"><i>${escapeHTML(product?.name || 'Sin producto')}</i><i>${escapeHTML(territory?.name || 'Sin territorio')}</i></span>
          <small>${escapeHTML(concept.derivationNote || concept.angle || concept.persona || 'Abre la tarjeta para documentar la hipótesis.')}</small>
        </button>
        ${changeLabels.length ? `<div class="derivation-chips" aria-label="Cambios de esta derivación">${changeLabels.map((label) => `<span>${escapeHTML(label)}</span>`).join('')}</div>` : ''}
        ${cycleFallback ? '<p class="builder-orphan-note"><svg aria-hidden="true"><use href="#i-alert" /></svg>Origen no disponible o circular.</p>' : ''}
        <div class="builder-card-facts" aria-label="Contenido conectado">
          <span><svg aria-hidden="true"><use href="#i-image" /></svg>${concept.executions.length} ${concept.executions.length === 1 ? 'creativo' : 'creativos'}</span>
          <span><svg aria-hidden="true"><use href="#i-meta" /></svg>${metaCount ? `${metaCount} en Meta` : 'Sin Meta'}</span>
          ${childCount ? `<span><svg aria-hidden="true"><use href="#i-branch" /></svg>${childCount} ${childCount === 1 ? 'rama' : 'ramas'}</span>` : ''}
        </div>
        <footer class="builder-card-actions">
          <button class="builder-derive-action" type="button" data-builder-derive="${escapeHTML(concept.id)}"><svg aria-hidden="true"><use href="#i-branch" /></svg>Derivar</button>
          <button type="button" data-map-concept-tab="creative" data-map-concept-id="${escapeHTML(concept.id)}" aria-label="Abrir creativos de ${escapeHTML(concept.title)}"><svg aria-hidden="true"><use href="#i-image" /></svg>Creativos</button>
          ${childCount ? `<button class="builder-collapse-action" type="button" data-map-toggle="${escapeHTML(collapseId)}" aria-expanded="${String(!collapsed)}" aria-label="${collapsed ? 'Expandir' : 'Contraer'} derivaciones de ${escapeHTML(concept.title)}"><svg aria-hidden="true"><use href="#i-chevron" /></svg></button>` : ''}
        </footer>
      </article>`;
  }

  function renderConceptMapView() {
    const client = getClient();
    const concepts = visibleConcepts(client);
    const hasContentFilter = ui.status !== 'all' || Boolean(ui.search.trim());
    let products = client.products.filter((product) => ui.selectedProductId === 'all' || product.id === ui.selectedProductId);
    if (hasContentFilter) products = products.filter((product) => concepts.some((concept) => concept.productId === product.id));
    els.simpleResultCount.textContent = `${concepts.length} ${concepts.length === 1 ? 'concepto' : 'conceptos'}`;
    if (!products.length) {
      els.simpleViewRoot.innerHTML = `
        <div class="simple-empty">
          <span class="simple-empty-icon"><svg aria-hidden="true"><use href="#i-search" /></svg></span>
          <h3>Sin ramas para mostrar</h3>
          <p>Prueba con otro producto, estado o término de búsqueda.</p>
          <button class="button secondary" type="button" data-clear-simple-filters>Limpiar filtros</button>
        </div>`;
      return;
    }
    const store = getMetaStore(client);
    const countLabel = concepts.length === client.concepts.length
      ? `${concepts.length} conceptos`
      : `${concepts.length} de ${client.concepts.length} visibles`;
    els.simpleViewRoot.innerHTML = `
      <div class="concept-map-view">
        <header class="concept-map-guide">
          <div class="concept-map-guide-copy">
            <span><svg aria-hidden="true"><use href="#i-branch" /></svg></span>
            <div><strong>Lectura de origen a activación</strong><p>Abre un concepto o entra directo a sus creativos y asociaciones.</p></div>
          </div>
          <div class="concept-map-key" aria-label="Niveles del mapa">
            <span><i class="product"></i>Producto</span>
            <span><i class="territory"></i>Territorio</span>
            <span><i class="concept"></i>Concepto</span>
          </div>
        </header>
        <div class="concept-map-scroll" tabindex="0" aria-label="Mapa conceptual de ${escapeHTML(client.name)}">
          <div class="concept-map-canvas" data-map-canvas>
            <svg class="concept-map-links" data-map-links aria-hidden="true"></svg>
            <div class="concept-map-tree">
              <article class="map-node map-client-node" data-map-node="client:${escapeHTML(client.id)}" data-map-kind="client" style="--client-color:${escapeHTML(client.color || '#7c3aed')}">
                <span class="map-node-eyebrow">Cliente raíz</span>
                <div class="map-client-identity"><span>${escapeHTML(initials(client.name))}</span><div><strong>${escapeHTML(client.name)}</strong><small>${escapeHTML(countLabel)}</small></div></div>
                <span class="map-client-connection ${store ? 'connected' : ''}"><svg aria-hidden="true"><use href="#i-meta" /></svg>${store ? `Tienda ${escapeHTML(client.storeId || '—')} conectada` : 'Meta por asociar'}</span>
              </article>
              <ul class="map-children map-products">
                ${products.map((product) => renderConceptMapProduct(client, product, concepts, hasContentFilter)).join('')}
              </ul>
            </div>
          </div>
        </div>
      </div>`;
    scheduleConceptMapConnections();
  }

  function renderConceptMapProduct(client, product, visible, hasContentFilter) {
    const nodeId = `product:${product.id}`;
    const collapsed = ui.collapsedMapNodeIds.includes(nodeId);
    const concepts = visible.filter((concept) => concept.productId === product.id);
    const total = client.concepts.filter((concept) => concept.productId === product.id).length;
    const allTerritories = product.territories || [];
    const knownTerritoryIds = new Set(allTerritories.map((territory) => territory.id));
    const unassigned = concepts.filter((concept) => !knownTerritoryIds.has(concept.territoryId));
    let territories = allTerritories;
    if (hasContentFilter) territories = territories.filter((territory) => concepts.some((concept) => concept.territoryId === territory.id));
    const countLabel = concepts.length === total ? `${total} conceptos` : `${concepts.length} de ${total} visibles`;
    const territoryMarkup = territories.map((territory) => renderConceptMapTerritory(client, product, territory, concepts)).join('');
    const unassignedMarkup = unassigned.length ? renderConceptMapUnassigned(client, product, unassigned) : '';
    const emptyMarkup = !territoryMarkup && !unassignedMarkup
      ? renderConceptMapEmptyNode(nodeId, product.id, null, 'Todavía sin territorios', 'Crear el primer concepto')
      : '';
    return `
      <li class="map-branch map-product-branch">
        <article class="map-node map-product-node" data-map-node="${escapeHTML(nodeId)}" data-map-parent="client:${escapeHTML(client.id)}" data-map-kind="product">
          <span class="map-node-eyebrow">Producto</span>
          <strong>${escapeHTML(product.name)}</strong>
          <p>${escapeHTML(product.description || 'Producto del cliente')}</p>
          <span class="map-node-count">${escapeHTML(countLabel)} · ${allTerritories.length} territorios</span>
          <button class="map-toggle" type="button" data-map-toggle="${escapeHTML(nodeId)}" aria-expanded="${String(!collapsed)}" aria-label="${collapsed ? 'Expandir' : 'Contraer'} ${escapeHTML(product.name)}"><svg aria-hidden="true"><use href="#i-chevron" /></svg></button>
        </article>
        <ul class="map-children map-territories" ${collapsed ? 'hidden' : ''}>
          ${territoryMarkup}${unassignedMarkup}${emptyMarkup}
        </ul>
      </li>`;
  }

  function renderConceptMapTerritory(client, product, territory, productConcepts) {
    const nodeId = `territory:${territory.id}`;
    const collapsed = ui.collapsedMapNodeIds.includes(nodeId);
    const concepts = productConcepts.filter((concept) => concept.territoryId === territory.id);
    const total = client.concepts.filter((concept) => concept.productId === product.id && concept.territoryId === territory.id).length;
    const countLabel = concepts.length === total ? `${total} conceptos` : `${concepts.length} de ${total} visibles`;
    return `
      <li class="map-branch map-territory-branch">
        <article class="map-node map-territory-node" data-map-node="${escapeHTML(nodeId)}" data-map-parent="product:${escapeHTML(product.id)}" data-map-kind="territory">
          <span class="map-node-eyebrow">Territorio / tesis</span>
          <strong>${escapeHTML(territory.name)}</strong>
          <p title="${escapeHTML(territory.thesis || '')}">${escapeHTML(territory.thesis || 'Tesis todavía sin documentar.')}</p>
          <span class="map-node-count">${escapeHTML(countLabel)}</span>
          <button class="map-toggle" type="button" data-map-toggle="${escapeHTML(nodeId)}" aria-expanded="${String(!collapsed)}" aria-label="${collapsed ? 'Expandir' : 'Contraer'} ${escapeHTML(territory.name)}"><svg aria-hidden="true"><use href="#i-chevron" /></svg></button>
        </article>
        <ul class="map-children map-concepts" ${collapsed ? 'hidden' : ''}>
          ${concepts.length
            ? concepts.map((concept) => renderConceptMapConcept(client, concept, nodeId)).join('')
            : renderConceptMapEmptyNode(nodeId, product.id, territory.id, 'Sin conceptos todavía', 'Crear dentro de este territorio')}
        </ul>
      </li>`;
  }

  function renderConceptMapUnassigned(client, product, concepts) {
    const nodeId = `territory:unassigned:${product.id}`;
    const collapsed = ui.collapsedMapNodeIds.includes(nodeId);
    return `
      <li class="map-branch map-territory-branch">
        <article class="map-node map-territory-node unassigned" data-map-node="${escapeHTML(nodeId)}" data-map-parent="product:${escapeHTML(product.id)}" data-map-kind="territory">
          <span class="map-node-eyebrow">Por ordenar</span>
          <strong>Sin territorio</strong>
          <p>Conceptos que todavía no tienen una tesis de origen asignada.</p>
          <span class="map-node-count">${concepts.length} ${concepts.length === 1 ? 'concepto' : 'conceptos'}</span>
          <button class="map-toggle" type="button" data-map-toggle="${escapeHTML(nodeId)}" aria-expanded="${String(!collapsed)}" aria-label="${collapsed ? 'Expandir' : 'Contraer'} conceptos sin territorio"><svg aria-hidden="true"><use href="#i-chevron" /></svg></button>
        </article>
        <ul class="map-children map-concepts" ${collapsed ? 'hidden' : ''}>
          ${concepts.map((concept) => renderConceptMapConcept(client, concept, nodeId)).join('')}
        </ul>
      </li>`;
  }

  function renderConceptMapConcept(client, concept, parentId) {
    const status = getStatus(concept.status);
    const style = statusStyles[concept.status] || statusStyles.draft;
    const metrics = conceptMetrics(client, concept);
    const metaKeys = new Set([
      ...(concept.metaLinks || []),
      ...concept.executions.flatMap((execution) => execution.metaLinks || []),
    ].map((link) => `${link.type}:${link.id}`));
    const executionSummary = concept.executions.length
      ? `${concept.executions.slice(0, 2).map((execution) => execution.title).join(' · ')}${concept.executions.length > 2 ? ` · +${concept.executions.length - 2}` : ''}`
      : 'Sin piezas todavía';
    const metaLabel = concept.metaLinks.length
      ? conceptMetaLabel(client, concept)
      : metaKeys.size ? `${metaKeys.size} asociaciones en creativos` : 'Sin asociación todavía';
    const result = metrics?.roas
      ? `${decimal.format(metrics.roas)}x ROAS`
      : metrics?.messages ? `${number.format(metrics.messages)} mensajes` : 'Sin resultados';
    return `
      <li class="map-concept-item">
        <article class="map-node map-concept-node" data-map-node="concept:${escapeHTML(concept.id)}" data-map-parent="${escapeHTML(parentId)}" data-map-kind="concept" style="--status-color:${style.color};--status-text:${style.text}">
          <button class="map-concept-main" type="button" data-concept-id="${escapeHTML(concept.id)}" data-map-concept-tab="strategy" data-map-concept-id="${escapeHTML(concept.id)}" aria-label="Abrir estrategia de ${escapeHTML(concept.title)}">
            <span class="map-concept-top"><span class="status-badge">${escapeHTML(status.label)}</span>${concept.awareness ? `<span>${escapeHTML(concept.awareness)}</span>` : ''}</span>
            <strong>${escapeHTML(concept.title)}</strong>
            <small>${escapeHTML(concept.angle || concept.persona || 'Ángulo todavía sin documentar.')}</small>
          </button>
          <div class="map-concept-leaves">
            <button type="button" data-map-concept-tab="creative" data-map-concept-id="${escapeHTML(concept.id)}" aria-label="Abrir creativos de ${escapeHTML(concept.title)}">
              <svg aria-hidden="true"><use href="#i-image" /></svg><span><strong>${concept.executions.length} ${concept.executions.length === 1 ? 'creativo' : 'creativos'}</strong><small title="${escapeHTML(executionSummary)}">${escapeHTML(executionSummary)}</small></span>
            </button>
            <button type="button" data-map-concept-tab="meta" data-map-concept-id="${escapeHTML(concept.id)}" aria-label="Abrir asociaciones Meta de ${escapeHTML(concept.title)}">
              <svg aria-hidden="true"><use href="#i-meta" /></svg><span><strong>${metaKeys.size ? `${metaKeys.size} en Meta` : 'Sin Meta'}</strong><small title="${escapeHTML(metaLabel)}">${escapeHTML(metaLabel)}</small></span><em>${escapeHTML(result)}</em>
            </button>
          </div>
        </article>
      </li>`;
  }

  function renderConceptMapEmptyNode(parentId, productId, territoryId, title, action) {
    const key = territoryId || productId;
    return `
      <li class="map-concept-item">
        <button class="map-node map-empty-node" type="button" data-map-node="empty:${escapeHTML(key)}" data-map-parent="${escapeHTML(parentId)}" data-map-kind="empty" data-empty-add="${escapeHTML(productId)}" ${territoryId ? `data-territory-id="${escapeHTML(territoryId)}"` : ''}>
          <svg aria-hidden="true"><use href="#i-plus" /></svg><span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(action)}</small></span>
        </button>
      </li>`;
  }

  function scheduleConceptMapConnections() {
    cancelAnimationFrame(conceptMapFrame);
    conceptMapFrame = requestAnimationFrame(drawConceptMapConnections);
  }

  function drawConceptMapConnections() {
    const canvas = $('[data-map-canvas]', els.simpleViewRoot);
    const svg = $('[data-map-links]', els.simpleViewRoot);
    if (!canvas || !svg || ui.mode !== 'conceptual') return;
    const canvasRect = canvas.getBoundingClientRect();
    const width = canvas.scrollWidth;
    const height = canvas.scrollHeight;
    svg.replaceChildren();
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const nodes = new Map($$('[data-map-node]', canvas)
      .filter((node) => node.getClientRects().length)
      .map((node) => [node.dataset.mapNode, node]));
    for (const [childId, child] of nodes) {
      const parent = nodes.get(child.dataset.mapParent);
      if (!parent) continue;
      const from = parent.getBoundingClientRect();
      const to = child.getBoundingClientRect();
      const x1 = from.right - canvasRect.left;
      const y1 = from.top + (from.height / 2) - canvasRect.top;
      const x2 = to.left - canvasRect.left;
      const y2 = to.top + (to.height / 2) - canvasRect.top;
      const bend = Math.max(22, Math.min(60, (x2 - x1) * 0.48));
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
      path.setAttribute('class', `map-link map-link-${child.dataset.mapKind || 'concept'}`);
      path.dataset.mapEdgeChild = childId;
      svg.append(path);
    }
  }

  function renderClientList() {
    const term = (ui.clientSearch || '').trim().toLowerCase();
    const clients = state.clients.filter((client) => !term || `${client.name} ${client.domain || ''}`.toLowerCase().includes(term));
    els.clientCount.textContent = String(clients.length);
    els.clientList.innerHTML = clients.map((client) => {
      const linked = getMetaStore(client);
      return `
        <button class="client-option ${client.id === ui.selectedClientId ? 'active' : ''}" type="button" data-client-id="${escapeHTML(client.id)}" style="--client-color:${escapeHTML(client.color || '#7c3aed')}" aria-pressed="${client.id === ui.selectedClientId}">
          <span class="client-avatar">${escapeHTML(initials(client.name))}</span>
          <span><strong>${escapeHTML(client.name)}</strong><small>${client.concepts.length} conceptos · Tienda ${escapeHTML(client.storeId || '—')}</small></span>
          ${linked ? `<span class="connection-icon" title="Cuenta Meta vinculada"><svg><use href="#i-meta" /></svg></span>` : ''}
        </button>`;
    }).join('') || `<p class="table-muted">No encontramos clientes.</p>`;
  }

  function renderProductFilters() {
    const client = getClient();
    const allCount = client.concepts.length;
    const items = [{ id: 'all', name: 'Todos los productos', count: allCount }, ...client.products.map((product) => ({
      id: product.id,
      name: product.name,
      count: client.concepts.filter((concept) => concept.productId === product.id).length,
    }))];
    if (!items.some((item) => item.id === ui.selectedProductId)) ui.selectedProductId = 'all';
    els.productFilters.innerHTML = items.map((item) => `
      <button class="product-filter ${item.id === ui.selectedProductId ? 'active' : ''}" type="button" data-product-id="${escapeHTML(item.id)}" aria-pressed="${item.id === ui.selectedProductId}">
        <span>${escapeHTML(item.name)}</span><span>${item.count}</span>
      </button>`).join('');
  }

  function renderClientSummary() {
    const client = getClient();
    const meta = getMetaStore(client);
    const active = client.concepts.filter((concept) => ['testing', 'winner', 'scaling'].includes(concept.status)).length;
    els.clientSummary.style.setProperty('--client-color', client.color || '#7c3aed');
    els.clientSummary.innerHTML = `
      <div class="summary-identity">
        <span class="client-avatar" style="--client-color:${escapeHTML(client.color || '#7c3aed')}">${escapeHTML(initials(client.name))}</span>
        <div><h2>${escapeHTML(client.name)}</h2><p>${escapeHTML(client.domain || `Tienda Plasa #${client.storeId || '—'}`)}</p></div>
      </div>
      <div class="summary-meta">
        <div class="summary-tags"><span class="tiny-badge">${client.products.length} productos</span><span class="tiny-badge">${client.concepts.length} conceptos</span><span class="tiny-badge">${active} activos</span></div>
        <div class="summary-meta-account">
          <svg><use href="#i-meta" /></svg>
          <div><strong>${escapeHTML(meta?.account?.name || 'Sin cuenta Meta')}</strong><small>${meta ? `act_${escapeHTML(meta.account.id)} · ${escapeHTML(meta.account.status)}` : 'Asociación pendiente'}</small></div>
        </div>
      </div>`;
  }

  function renderKpis() {
    const client = getClient();
    const meta = getMetaStore(client);
    const metrics = meta?.windows?.[String(ui.dateRange)] || meta?.windows?.[ui.dateRange] || {};
    const rangeLabel = metrics.range ? metrics.range.replace('..', ' → ') : 'Sin datos';
    const cards = [
      { label: 'Inversión', value: metrics.spend == null ? '—' : money.format(metrics.spend), note: rangeLabel, icon: 'i-chart', tint: '#ede9fe' },
      { label: 'Compras', value: metrics.purchases == null ? '—' : number.format(metrics.purchases), note: `${number.format(metrics.messages || 0)} conversaciones`, icon: 'i-check', tint: '#ecfdf5' },
      { label: 'Ingresos atribuidos', value: metrics.revenue == null ? '—' : money.format(metrics.revenue), note: ui.dateRange === 30 && metrics.offlinePurchases ? `${metrics.offlinePurchases} compras offline incluidas` : 'Valor atribuido por Meta', icon: 'i-chart', tint: '#eff6ff' },
      { label: 'ROAS', value: metrics.roas == null ? '—' : `${decimal.format(metrics.roas)}x`, note: metrics.ctr == null ? 'Sin CTR' : `CTR ${decimal.format(metrics.ctr)}%`, icon: 'i-arrow', tint: '#fff7ed' },
      { label: 'CPA compra', value: metrics.cpa == null ? '—' : money.format(metrics.cpa), note: metrics.cpc == null ? 'Sin CPC' : `CPC ${money.format(metrics.cpc)}`, icon: 'i-users', tint: '#fdf2f8' },
    ];
    els.kpiGrid.innerHTML = cards.map((card) => `
      <article class="kpi-card" style="--kpi-tint:${card.tint}">
        <span class="kpi-label">${escapeHTML(card.label)}<svg><use href="#${card.icon}" /></svg></span>
        <strong class="kpi-value">${escapeHTML(card.value)}</strong>
        <small class="kpi-footnote" title="${escapeHTML(card.note)}">${escapeHTML(card.note)}</small>
      </article>`).join('');
  }

  function renderViewTabs() {
    $$('.view-tab').forEach((tab) => {
      const active = tab.dataset.view === ui.view;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    els.mapLegend.hidden = ui.view !== 'map';
  }

  function visibleConcepts(client = getClient()) {
    const query = (ui.search || '').trim().toLowerCase();
    return client.concepts.filter((concept) => {
      if (ui.selectedProductId !== 'all' && concept.productId !== ui.selectedProductId) return false;
      if (ui.status !== 'all' && concept.status !== ui.status) return false;
      if (!query) return true;
      const product = getProduct(client, concept.productId);
      const territory = getTerritory(client, concept.productId, concept.territoryId);
      const haystack = [
        product?.name,
        territory?.name,
        territory?.thesis,
        concept.title,
        concept.persona,
        concept.offer,
        concept.angle,
        concept.awareness,
        conceptMetaLabel(client, concept),
        ...concept.executions.flatMap((execution) => [execution.title, execution.format, execution.hook, execution.content]),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderView() {
    if (ui.view === 'board') renderBoard();
    else if (ui.view === 'list') renderList();
    else renderMap();
  }

  function renderMap() {
    const client = getClient();
    const visible = visibleConcepts(client);
    const visibleIds = new Set(visible.map((concept) => concept.id));
    const products = client.products.filter((product) => ui.selectedProductId === 'all' || product.id === ui.selectedProductId);
    const hasFiltering = ui.status !== 'all' || Boolean(ui.search.trim());
    const productMarkup = products.map((product) => {
      const territories = product.territories || [];
      const lanes = territories.map((territory) => {
        const concepts = client.concepts.filter((concept) => concept.territoryId === territory.id && visibleIds.has(concept.id));
        if (!concepts.length && hasFiltering) return '';
        return `
          <section class="territory-lane">
            <div class="territory-node">
              <span class="territory-label"><i></i>Territorio / tesis</span>
              <h4>${escapeHTML(territory.name)}</h4>
              <p title="${escapeHTML(territory.thesis || '')}">${escapeHTML(territory.thesis || 'Tesis aún sin documentar.')}</p>
            </div>
            <div class="concept-branch">
              ${concepts.length ? concepts.map((concept) => renderConceptCard(client, concept)).join('') : `<button class="board-empty" type="button" data-empty-add="${escapeHTML(product.id)}" data-territory-id="${escapeHTML(territory.id)}">+ Crear primer concepto</button>`}
            </div>
          </section>`;
      }).join('');
      const productConcepts = visible.filter((concept) => concept.productId === product.id);
      if (!lanes && hasFiltering) return '';
      return `
        <article class="product-map">
          <header class="product-map-header">
            <div class="product-title"><span class="product-node-icon"><svg><use href="#i-grid" /></svg></span><div><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.description || 'Producto')}</p></div></div>
            <span class="tiny-badge">${productConcepts.length} conceptos visibles</span>
          </header>
          ${lanes || `<div class="empty-state"><div><svg><use href="#i-bulb" /></svg><h3>Producto listo para explorar</h3><p>Todavía no tiene territorios documentados.</p><button class="button secondary" type="button" data-empty-add="${escapeHTML(product.id)}">Crear concepto</button></div></div>`}
        </article>`;
    }).join('');
    els.viewRoot.innerHTML = `<div class="map-view">${productMarkup || renderEmpty('Sin coincidencias', 'Prueba otro estado, producto o término de búsqueda.', 'i-search')}</div>`;
  }

  function renderConceptCard(client, concept) {
    const status = getStatus(concept.status);
    const style = statusStyles[concept.status] || statusStyles.draft;
    const metrics = conceptMetrics(client, concept);
    const metaLabel = conceptMetaLabel(client, concept);
    return `
      <button class="concept-card" type="button" data-concept-id="${escapeHTML(concept.id)}" aria-label="Abrir concepto: ${escapeHTML(concept.title)}" style="--status-color:${style.color};--status-text:${style.text}">
        <span class="concept-card-accent"></span>
        <span class="concept-card-body">
          <span class="concept-card-topline"><span class="status-badge">${escapeHTML(status.label)}</span>${concept.awareness ? `<span class="awareness-badge">${escapeHTML(concept.awareness)}</span>` : ''}</span>
          <h5>${escapeHTML(concept.title)}</h5>
          <span class="concept-angle">${escapeHTML(concept.angle || 'Ángulo todavía sin documentar.')}</span>
          <span class="concept-meta-row"><svg><use href="#i-meta" /></svg><span>${escapeHTML(metaLabel)}</span></span>
        </span>
        <span class="concept-card-footer">
          <span class="execution-count"><svg><use href="#i-image" /></svg>${concept.executions.length} ejecuciones</span>
          <span class="concept-metrics">${metrics ? `<span>${money.format(metrics.spend || 0)}</span><span class="positive">${decimal.format(metrics.roas || 0)}x</span>` : '<span>Sin resultados</span>'}</span>
        </span>
        ${concept.derivedFrom ? '<span class="derived-indicator" title="Concepto derivado"><svg><use href="#i-branch" /></svg></span>' : ''}
      </button>`;
  }

  function renderBoard() {
    const client = getClient();
    const concepts = visibleConcepts(client);
    els.viewRoot.innerHTML = `
      <div class="board-view">
        <div class="board-grid">
          ${state.statuses.map((status) => {
            const style = statusStyles[status.id] || statusStyles.draft;
            const inColumn = concepts.filter((concept) => concept.status === status.id);
            return `<section class="board-column" data-drop-status="${escapeHTML(status.id)}">
              <header class="board-column-header"><span class="board-column-title" style="--status-color:${style.color}"><i></i>${escapeHTML(status.label)}</span><span>${inColumn.length}</span></header>
              <div class="board-cards">${inColumn.length ? inColumn.map((concept) => renderBoardCard(client, concept)).join('') : '<div class="board-empty">Arrastra aquí</div>'}</div>
            </section>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderBoardCard(client, concept) {
    const product = getProduct(client, concept.productId);
    const metrics = conceptMetrics(client, concept);
    return `<article class="board-card" draggable="true" data-drag-concept="${escapeHTML(concept.id)}" style="--client-color:${escapeHTML(client.color || '#7c3aed')}">
      <button type="button" data-concept-id="${escapeHTML(concept.id)}" aria-label="Abrir concepto: ${escapeHTML(concept.title)}"><span class="board-card-client">${escapeHTML(product?.name || client.name)}</span><h4>${escapeHTML(concept.title)}</h4><p>${escapeHTML(concept.angle || concept.persona || '')}</p></button>
      <div class="board-card-footer"><span><svg><use href="#i-image" /></svg>${concept.executions.length}</span><span>${metrics ? `${decimal.format(metrics.roas || 0)}x ROAS` : 'Sin Meta'}</span></div>
    </article>`;
  }

  function renderList() {
    const client = getClient();
    const concepts = visibleConcepts(client);
    if (!concepts.length) {
      els.viewRoot.innerHTML = renderEmpty('Sin coincidencias', 'Prueba otro estado, producto o término de búsqueda.', 'i-search');
      return;
    }
    els.viewRoot.innerHTML = `<div class="list-view"><table class="concept-table">
      <thead><tr><th>Concepto</th><th>Producto / territorio</th><th>Estado</th><th>Creativos</th><th>Meta</th><th>Inversión 30d</th><th>ROAS 30d</th></tr></thead>
      <tbody>${concepts.map((concept) => {
        const product = getProduct(client, concept.productId);
        const territory = getTerritory(client, concept.productId, concept.territoryId);
        const status = getStatus(concept.status);
        const style = statusStyles[concept.status] || statusStyles.draft;
        const metrics = conceptMetrics(client, concept);
        return `<tr>
          <td><button class="table-concept-button" type="button" data-concept-id="${escapeHTML(concept.id)}">${escapeHTML(concept.title)}</button><span class="table-muted">${escapeHTML(concept.angle || '')}</span></td>
          <td>${escapeHTML(product?.name || '—')}<span class="table-muted">${escapeHTML(territory?.name || 'Sin territorio')}</span></td>
          <td><span class="status-badge" style="--status-color:${style.color};--status-text:${style.text}">${escapeHTML(status.label)}</span></td>
          <td class="numeric">${concept.executions.length}</td>
          <td><span class="table-muted">${escapeHTML(conceptMetaLabel(client, concept))}</span></td>
          <td class="numeric">${metrics ? money.format(metrics.spend || 0) : '—'}</td>
          <td class="numeric">${metrics ? `${decimal.format(metrics.roas || 0)}x` : '—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }

  function renderEmpty(title, text, icon = 'i-bulb') {
    return `<div class="empty-state"><div><svg><use href="#${icon}" /></svg><h3>${escapeHTML(title)}</h3><p>${escapeHTML(text)}</p></div></div>`;
  }

  function getMetaNode(client, link) {
    const store = getMetaStore(client);
    if (!store) return null;
    if (link.type === 'campaign') return store.campaigns.find((campaign) => campaign.id === link.id) || null;
    for (const campaign of store.campaigns) {
      const adset = (campaign.adsets || []).find((item) => item.id === link.id);
      if (adset) return { ...adset, campaignId: campaign.id, campaignName: campaign.name };
    }
    return null;
  }

  function conceptMetaLabel(client, concept) {
    const links = concept.metaLinks || [];
    if (!links.length) return 'Sin asociación Meta';
    const adset = links.find((link) => link.type === 'adset');
    const node = adset ? getMetaNode(client, adset) : getMetaNode(client, links[0]);
    if (!node) return `${links.length} asociaciones guardadas`;
    return links.length > 2 ? `${node.name} +${links.length - 1}` : node.name;
  }

  function conceptMetrics(client, concept) {
    const links = concept.metaLinks || [];
    const adsetNodes = links.filter((link) => link.type === 'adset').map((link) => getMetaNode(client, link)).filter(Boolean);
    const campaignNodes = links.filter((link) => link.type === 'campaign').map((link) => getMetaNode(client, link)).filter(Boolean);
    const nodes = adsetNodes.length ? adsetNodes : campaignNodes.map((campaign) => campaign.metrics30d).filter(Boolean);
    if (!nodes.length) return null;
    const total = nodes.reduce((acc, node) => {
      const source = node.metrics30d || node;
      for (const key of ['spend', 'purchases', 'revenue', 'messages']) acc[key] += Number(source[key] || 0);
      return acc;
    }, { spend: 0, purchases: 0, revenue: 0, messages: 0 });
    total.roas = total.spend ? total.revenue / total.spend : 0;
    total.cpa = total.purchases ? total.spend / total.purchases : null;
    return total;
  }

  function updateSnapshotLabel() {
    if (!metaSnapshot.capturedAt) return;
    const date = new Date(metaSnapshot.capturedAt);
    els.snapshotState.innerHTML = `<span class="status-dot"></span>Datos ficticios · ${new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short' }).format(date)}`;
    els.snapshotState.title = `Datos ficticios generados ${date.toLocaleString('es-CL')}. La demo no consulta sistemas externos.`;
  }

  function normalizeSimpleEditorSection(value) {
    if (value === 'creative') return 'creative';
    if (value === 'meta' || value === 'results' || value === 'test') return 'test';
    if (value === 'history') return 'history';
    if (value === 'context') return 'context';
    return null;
  }

  function openInspector(conceptId, tab = null) {
    const found = findConcept(conceptId);
    if (!found) return;
    lastFocused = document.activeElement;
    ui.inspectorConceptId = conceptId;
    if (ui.mode === 'conceptual') {
      ui.simpleEditorSection = normalizeSimpleEditorSection(tab);
      ui.inspectorTab = 'strategy';
    } else {
      ui.inspectorTab = tab || ui.inspectorTab || 'strategy';
    }
    setSimpleInspectorMenu(false);
    renderInspector();
    if (ui.mode === 'conceptual') {
      syncEmbeddedInspectorVisibility();
      $$('[data-concept-id]', els.simpleViewRoot).forEach((button) => {
        const selectedConcept = button.dataset.conceptId === conceptId;
        button.setAttribute('aria-current', String(selectedConcept));
        button.closest('.cascade-concept-branch')?.classList.toggle('selected', selectedConcept);
        button.closest('.cascade-concept-branch')?.setAttribute('aria-selected', String(selectedConcept));
      });
      saveNow();
      return;
    }
    els.drawerBackdrop.hidden = false;
    els.inspector.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      els.drawerBackdrop.classList.add('visible');
      els.inspector.classList.add('open');
      $('#closeInspectorBtn')?.focus();
    });
    saveNow();
  }

  function closeInspector() {
    ui.inspectorConceptId = null;
    ui.simpleEditorSection = null;
    if (ui.mode === 'conceptual') {
      syncEmbeddedInspectorVisibility();
      $$('.cascade-concept-branch.selected', els.simpleViewRoot).forEach((branch) => {
        branch.classList.remove('selected');
        branch.setAttribute('aria-selected', 'false');
        $('[data-concept-id]', branch)?.setAttribute('aria-current', 'false');
      });
      saveNow();
      if (lastFocused instanceof HTMLElement) lastFocused.focus();
      return;
    }
    els.inspector.classList.remove('open');
    els.drawerBackdrop.classList.remove('visible');
    els.inspector.setAttribute('aria-hidden', 'true');
    setTimeout(() => { els.drawerBackdrop.hidden = true; }, 210);
    saveNow();
    if (lastFocused instanceof HTMLElement) lastFocused.focus();
  }

  function renderInspector() {
    const found = findConcept(ui.inspectorConceptId);
    if (!found) {
      closeInspector();
      return;
    }
    const { client, concept } = found;
    const product = getProduct(client, concept.productId);
    els.inspectorClient.textContent = client.name;
    els.inspectorProduct.textContent = product?.name || 'Sin producto';
    els.inspectorTitle.textContent = concept.title || 'Concepto sin nombre';
    els.quickStatus.value = concept.status;
    els.creativeCountBadge.textContent = String(concept.executions.length);
    els.metaCountBadge.textContent = String(concept.metaLinks.length);
    const simpleSheet = ui.mode === 'conceptual';
    els.inspector.classList.toggle('simple-sheet-editor', simpleSheet);
    if (simpleSheet) {
      if (ui.simpleEditorSection === 'context') els.inspectorBody.innerHTML = renderSimpleContextInspector(client, concept);
      else if (ui.simpleEditorSection === 'creative') els.inspectorBody.innerHTML = renderSimpleCreativeInspector(client, concept);
      else if (ui.simpleEditorSection === 'test') els.inspectorBody.innerHTML = renderSimpleTestInspector(client, concept);
      else if (ui.simpleEditorSection === 'history') els.inspectorBody.innerHTML = renderSimpleHistoryInspector(client, concept);
      else els.inspectorBody.innerHTML = renderSimpleConceptSheet(client, concept);
      return;
    }
    $$('.inspector-tab').forEach((tab) => {
      const active = tab.dataset.tab === ui.inspectorTab;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    if (ui.inspectorTab === 'creative') els.inspectorBody.innerHTML = renderCreativeInspector(client, concept);
    else if (ui.inspectorTab === 'meta') els.inspectorBody.innerHTML = renderMetaInspector(client, concept);
    else if (ui.inspectorTab === 'results') els.inspectorBody.innerHTML = renderResultsInspector(client, concept);
    else if (ui.inspectorTab === 'history') els.inspectorBody.innerHTML = renderHistoryInspector(client, concept);
    else els.inspectorBody.innerHTML = renderStrategyInspector(client, concept);
  }

  function selected(value, current) {
    return String(value ?? '') === String(current ?? '') ? 'selected' : '';
  }

  function checked(value) {
    return value ? 'checked' : '';
  }

  function summarizeText(value, fallback, limit = 110) {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return fallback;
    return normalized.length > limit ? `${normalized.slice(0, Math.max(1, limit - 1)).trimEnd()}…` : normalized;
  }

  function awarenessLabel(value) {
    return ({ UNAWARE: 'Unaware', PAIN: 'Problem aware', SOL: 'Solution aware', PRO: 'Product aware' })[value] || 'Awareness pendiente';
  }

  function renderSimpleSheetRow({ section, icon, title, summary, badge }) {
    return `
      <button class="sheet-navigation-row" type="button" data-simple-editor-section="${escapeHTML(section)}" aria-label="Abrir ${escapeHTML(title)}. ${escapeHTML(summary)}">
        <span class="sheet-navigation-icon"><svg aria-hidden="true"><use href="#${escapeHTML(icon)}" /></svg></span>
        <span class="sheet-navigation-copy"><strong>${escapeHTML(title)}</strong><small>${escapeHTML(summary)}</small></span>
        ${badge ? `<em>${escapeHTML(badge)}</em>` : ''}
        <svg class="sheet-navigation-arrow" aria-hidden="true"><use href="#i-arrow" /></svg>
      </button>`;
  }

  function renderSimpleSubviewHeader(icon, kicker, title, description) {
    return `
      <header class="sheet-subview-header" tabindex="-1" data-sheet-subview-heading>
        <button class="sheet-back-button" type="button" data-simple-editor-section="main"><svg aria-hidden="true"><use href="#i-arrow" /></svg>Volver a la ficha</button>
        <div class="sheet-subview-title"><span><svg aria-hidden="true"><use href="#${escapeHTML(icon)}" /></svg></span><div><p>${escapeHTML(kicker)}</p><h3>${escapeHTML(title)}</h3><small>${escapeHTML(description)}</small></div></div>
      </header>`;
  }

  function renderSimpleConceptSheet(client, concept) {
    const product = getProduct(client, concept.productId);
    const territory = getTerritory(client, concept.productId, concept.territoryId);
    const parent = concept.derivedFrom ? findConcept(concept.derivedFrom) : null;
    const metrics = conceptMetrics(client, concept);
    const warnings = (concept.notes || []).filter((note) => note.type === 'warning');
    const changes = [...new Set(Object.entries(concept.derivationChanges || {}).filter(([, changed]) => changed).map(([field]) => derivationLabels[field] || field))];
    const executions = concept.executions || [];
    const formats = [...new Set(executions.map((execution) => execution.format).filter(Boolean))];
    const metaCount = new Set((concept.metaLinks || []).map((link) => `${link.type}:${link.id}`)).size;
    const noteCount = (concept.notes || []).length;
    const latestNote = [...(concept.notes || [])].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
    const contextSummary = `${territory?.name || product?.name || 'Sin territorio'} · ${summarizeText(concept.persona, 'Persona por definir', 74)}`;
    const creativeSummary = executions.length
      ? `${formats.length ? formats.slice(0, 2).join(' · ') : 'Formatos por definir'} · ${executions.length} ${executions.length === 1 ? 'pieza' : 'piezas'}`
      : 'Todavía no hay piezas; puedes crear la primera.';
    const testSummary = metrics
      ? `${decimal.format(metrics.roas || 0)}x ROAS · ${number.format(metrics.purchases || 0)} compras · ${money.format(metrics.spend || 0)} invertidos`
      : metaCount
        ? `${metaCount} ${metaCount === 1 ? 'asociación' : 'asociaciones'} · todavía sin señal atribuible`
        : 'Sin asociaciones Meta; la prueba aún no comienza.';
    const notesSummary = latestNote
      ? summarizeText(latestNote.text, `${noteCount} registros`, 92)
      : 'Anota una observación, decisión o próximo paso.';
    return `
      <article class="simple-concept-sheet">
        ${parent ? `<div class="sheet-origin"><svg aria-hidden="true"><use href="#i-branch" /></svg><div><small>Derivación de</small><strong>${escapeHTML(parent.concept.title)}</strong>${changes.length ? `<span>${changes.map((change) => escapeHTML(change)).join(' · ')}</span>` : ''}</div></div>` : ''}
        <label class="sheet-title-field"><span>Nombre del concepto</span><input data-field="title" value="${escapeHTML(concept.title)}" maxlength="100" autocomplete="off" /></label>
        <div class="sheet-context-chips" aria-label="Contexto heredado"><span>${escapeHTML(product?.name || 'Sin producto')}</span><span>${escapeHTML(territory?.name || 'Sin territorio')}</span><span>${escapeHTML(awarenessLabel(concept.awareness))}</span></div>
        <label class="sheet-idea-field">
          <span class="sheet-field-kicker">Idea central</span>
          <strong>¿Qué queremos probar con esta idea?</strong>
          <small>Escribe la tensión, promesa o creencia principal. No tiene que quedar perfecta.</small>
          <textarea data-field="angle" rows="5" placeholder="Ej. Una molestia cotidiana puede tener una causa que la persona todavía no ha considerado.">${escapeHTML(concept.angle || '')}</textarea>
        </label>
        <nav class="sheet-navigation" aria-label="Detalles de la idea">
          ${renderSimpleSheetRow({ section: 'context', icon: 'i-users', title: 'Contexto', summary: contextSummary, badge: concept.offer ? 'Definido' : 'Pendiente' })}
          ${renderSimpleSheetRow({ section: 'creative', icon: 'i-image', title: 'Piezas', summary: creativeSummary, badge: String(executions.length) })}
          ${renderSimpleSheetRow({ section: 'test', icon: 'i-meta', title: 'Prueba', summary: testSummary, badge: metaCount ? String(metaCount) : 'Sin conectar' })}
          ${renderSimpleSheetRow({ section: 'history', icon: 'i-comment', title: 'Notas', summary: notesSummary, badge: String(noteCount) })}
        </nav>
        ${warnings.length ? `<div class="sheet-warning-summary"><svg aria-hidden="true"><use href="#i-alert" /></svg><span><strong>${warnings.length} ${warnings.length === 1 ? 'validación pendiente' : 'validaciones pendientes'}</strong><small>${escapeHTML(summarizeText(warnings[0].text, 'Revisar antes de publicar.', 120))}</small></span></div>` : ''}
        <section class="sheet-quick-note" aria-labelledby="quickNoteTitle">
          <div><span class="sheet-field-kicker">Registro rápido</span><strong id="quickNoteTitle">Deja una nota sin salir de la ficha</strong></div>
          <input id="newNoteType" type="hidden" value="internal" />
          <div class="sheet-quick-note-row"><label class="sr-only" for="newNoteText">Nota rápida</label><textarea id="newNoteText" rows="2" placeholder="Observación, decisión o siguiente paso…"></textarea><button class="button secondary" type="button" data-action="add-note"><svg aria-hidden="true"><use href="#i-plus" /></svg>Agregar</button></div>
        </section>
      </article>`;
  }

  function renderSimpleContextInspector(client, concept) {
    const product = getProduct(client, concept.productId);
    const territories = product?.territories || [];
    const parent = concept.derivedFrom ? findConcept(concept.derivedFrom) : null;
    const warnings = (concept.notes || []).filter((note) => note.type === 'warning');
    return `
      <div class="simple-sheet-subview">
        ${renderSimpleSubviewHeader('i-users', 'Contexto', '¿A quién hablamos y qué le ofrecemos?', 'Estos datos acompañan la idea, pero no necesitan competir con ella en la ficha principal.')}
        <div class="sheet-subview-content">
          <div class="form-grid two-cols">
            <label class="field"><span>Producto</span><select data-field="productId">${client.products.map((item) => `<option value="${escapeHTML(item.id)}" ${selected(item.id, concept.productId)}>${escapeHTML(item.name)}</option>`).join('')}</select></label>
            <label class="field"><span>Territorio / tesis</span><select data-field="territoryId">${territories.length ? territories.map((item) => `<option value="${escapeHTML(item.id)}" ${selected(item.id, concept.territoryId)}>${escapeHTML(item.name)}</option>`).join('') : '<option value="">Sin territorio</option>'}</select></label>
          </div>
          <label class="field"><span>¿A quién le estamos hablando?</span><textarea data-field="persona" rows="4" placeholder="Situación, tensión y nivel de consciencia de la persona.">${escapeHTML(concept.persona || '')}</textarea></label>
          <label class="field"><span>¿Qué le prometemos u ofrecemos?</span><textarea data-field="offer" rows="4" placeholder="La promesa, mecanismo u oferta concreta.">${escapeHTML(concept.offer || '')}</textarea></label>
          <label class="field"><span>Nivel de awareness</span><select data-field="awareness"><option value="" ${selected('', concept.awareness)}>Sin clasificar</option><option value="UNAWARE" ${selected('UNAWARE', concept.awareness)}>Unaware</option><option value="PAIN" ${selected('PAIN', concept.awareness)}>Problem aware</option><option value="SOL" ${selected('SOL', concept.awareness)}>Solution aware</option><option value="PRO" ${selected('PRO', concept.awareness)}>Product aware</option></select></label>
          ${parent ? `<section class="sheet-context-section"><div><span class="sheet-field-kicker">Derivación</span><strong>¿Qué cambió respecto de “${escapeHTML(parent.concept.title)}”?</strong></div><div class="form-grid two-cols">${['hook', 'persona', 'offer', 'angle', 'format'].map((field) => `<label class="check-field"><input type="checkbox" data-derivation-field="${field}" ${checked(concept.derivationChanges?.[field] || (field === 'hook' && concept.derivationChanges?.creative))} /><span>${derivationLabels[field]}</span></label>`).join('')}<label class="field form-grid-full"><span>Nota de intención</span><textarea data-field="derivationNote" rows="3">${escapeHTML(concept.derivationNote || '')}</textarea></label></div></section>` : ''}
          ${warnings.length ? `<section class="sheet-context-section"><div><span class="sheet-field-kicker">Antes de publicar</span><strong>Validaciones pendientes</strong></div><div class="form-grid">${warnings.map((note) => `<div class="callout"><svg><use href="#i-alert" /></svg><div>${escapeHTML(note.text)}</div></div>`).join('')}</div></section>` : ''}
        </div>
      </div>`;
  }

  function renderSimpleCreativeInspector(client, concept) {
    return `<div class="simple-sheet-subview">${renderSimpleSubviewHeader('i-image', 'Producción', 'Piezas creativas', 'Convierte la idea en hooks, guiones y formatos concretos.')}<div class="sheet-subview-content">${renderCreativeInspector(client, concept)}</div></div>`;
  }

  function renderSimpleTestInspector(client, concept) {
    const store = getMetaStore(client);
    const metrics = conceptMetrics(client, concept);
    const linkCount = new Set((concept.metaLinks || []).map((link) => `${link.type}:${link.id}`)).size;
    const signal = !metrics ? 'Primero asocia una campaña o conjunto para leer resultados.' : metrics.roas >= 3 ? 'La señal es positiva; revisa calidad antes de decidir si escalar.' : metrics.purchases > 0 ? 'Hay una señal mixta; conviene iterar antes de aumentar presupuesto.' : 'No hay compras atribuidas; revisa objetivo, mensaje y ventana.';
    return `
      <div class="simple-sheet-subview">
        ${renderSimpleSubviewHeader('i-meta', 'Prueba', 'Conexión y aprendizaje', 'Meta y resultados viven juntos porque forman una sola pregunta: ¿qué ocurrió cuando probamos la idea?')}
        <div class="sheet-subview-content">
          <section class="sheet-test-summary">
            <div><span class="sheet-field-kicker">Señal actual</span><strong>${metrics ? `${decimal.format(metrics.roas || 0)}x ROAS` : 'Todavía sin señal'}</strong><p>${escapeHTML(signal)}</p></div>
            ${metrics ? `<div class="sheet-test-metrics">${metricCard('Inversión', money.format(metrics.spend || 0))}${metricCard('Compras', number.format(metrics.purchases || 0))}${metricCard('Conversaciones', number.format(metrics.messages || 0))}</div>` : ''}
          </section>
          <details class="sheet-disclosure">
            <summary><span><svg aria-hidden="true"><use href="#i-meta" /></svg><span><strong>Asociaciones Meta</strong><small>${linkCount ? `${linkCount} ${linkCount === 1 ? 'nodo vinculado' : 'nodos vinculados'}` : 'Selecciona dónde se está probando esta idea'}</small></span></span><svg aria-hidden="true"><use href="#i-chevron" /></svg></summary>
            <div class="sheet-disclosure-body">${store ? `<div class="meta-account-card"><svg><use href="#i-meta" /></svg><div><strong>${escapeHTML(store.account.name)}</strong><small>act_${escapeHTML(store.account.id)} · ${escapeHTML(store.account.status)}</small></div></div><div class="meta-tree">${store.campaigns.map((campaign) => renderCampaignGroup(concept, campaign)).join('')}</div>` : `<div class="callout"><svg><use href="#i-alert" /></svg><div>Este cliente todavía no tiene una cuenta Meta disponible en la fotografía local.</div></div>`}</div>
          </details>
          <details class="sheet-disclosure">
            <summary><span><svg aria-hidden="true"><use href="#i-chart" /></svg><span><strong>Decisión y aprendizaje</strong><small>${escapeHTML(concept.decision ? decisions.find((item) => item.id === concept.decision)?.label || 'Decisión registrada' : 'Todavía sin decisión')}</small></span></span><svg aria-hidden="true"><use href="#i-chevron" /></svg></summary>
            <div class="sheet-disclosure-body"><div class="form-grid"><label class="field"><span>Decisión</span><select data-field="decision">${decisions.map((item) => `<option value="${item.id}" ${selected(item.id, concept.decision)}>${escapeHTML(item.label)}</option>`).join('')}</select></label><label class="field"><span>¿Qué observamos y por qué?</span><textarea data-field="decisionReason" rows="4" placeholder="Registra la señal y la razón de la decisión.">${escapeHTML(concept.decisionReason || '')}</textarea></label></div></div>
          </details>
          <p class="sheet-snapshot-note"><svg aria-hidden="true"><use href="#i-alert" /></svg>Los resultados son ficticios y existen únicamente para demostrar el flujo de prueba.</p>
        </div>
      </div>`;
  }

  function renderSimpleHistoryInspector(client, concept) {
    const records = [
      ...(concept.notes || []).map((note) => ({ ...note, recordType: note.type || 'internal' })),
      ...(concept.history || []).map((event) => ({ ...event, text: event.text || event.message, recordType: event.type || 'internal' })),
    ].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return `
      <div class="simple-sheet-subview">
        ${renderSimpleSubviewHeader('i-comment', 'Registro', 'Notas y decisiones', 'Guarda el contexto humano que no cabe en métricas ni campos estructurados.')}
        <div class="sheet-subview-content">
          <section class="sheet-note-composer"><label class="field" for="newNoteText"><span>Nueva nota interna</span><textarea id="newNoteText" rows="3" placeholder="Observación, decisión o siguiente paso…"></textarea></label><input id="newNoteType" type="hidden" value="internal" /><button class="button primary" type="button" data-action="add-note"><svg aria-hidden="true"><use href="#i-plus" /></svg>Agregar nota</button></section>
          <section class="sheet-history-section"><div><span class="sheet-field-kicker">Historial</span><strong>${records.length} ${records.length === 1 ? 'registro' : 'registros'}</strong></div>${records.length ? `<div class="history-list">${records.map((record) => renderHistoryItem(record)).join('')}</div>` : renderEmpty('Todavía no hay historial', 'Las notas, asociaciones y decisiones aparecerán aquí.', 'i-comment')}</section>
        </div>
      </div>`;
  }

  function renderStrategyInspector(client, concept) {
    const product = getProduct(client, concept.productId);
    const territories = product?.territories || [];
    const parent = concept.derivedFrom ? findConcept(concept.derivedFrom) : null;
    const warnings = concept.notes.filter((note) => note.type === 'warning');
    return `
      ${parent ? `<div class="callout info"><svg><use href="#i-branch" /></svg><div><strong>Derivado de “${escapeHTML(parent.concept.title)}”</strong><br />${escapeHTML(concept.derivationNote || 'Marca qué componente cambió para conservar el aprendizaje.')}</div></div>` : ''}
      <section class="form-section">
        <div class="form-section-heading"><div><h3>Identidad estratégica</h3><p>Persona + oferta + ángulo forman este concepto.</p></div></div>
        <div class="form-grid">
          <label class="field"><span>Nombre del concepto</span><input data-field="title" value="${escapeHTML(concept.title)}" maxlength="100" /></label>
          <div class="form-grid two-cols">
            <label class="field"><span>Producto</span><select data-field="productId">${client.products.map((item) => `<option value="${escapeHTML(item.id)}" ${selected(item.id, concept.productId)}>${escapeHTML(item.name)}</option>`).join('')}</select></label>
            <label class="field"><span>Territorio / tesis</span><select data-field="territoryId">${territories.length ? territories.map((item) => `<option value="${escapeHTML(item.id)}" ${selected(item.id, concept.territoryId)}>${escapeHTML(item.name)}</option>`).join('') : '<option value="">Sin territorio</option>'}</select></label>
          </div>
          <label class="field"><span>Persona</span><textarea data-field="persona" rows="4">${escapeHTML(concept.persona || '')}</textarea><small class="helper">La situación, consciencia y tensión de la persona; no solo datos demográficos.</small></label>
          <label class="field"><span>Oferta</span><textarea data-field="offer" rows="3">${escapeHTML(concept.offer || '')}</textarea></label>
          <label class="field"><span>Ángulo</span><textarea data-field="angle" rows="4">${escapeHTML(concept.angle || '')}</textarea></label>
          <label class="field"><span>Nivel de awareness</span><select data-field="awareness"><option value="" ${selected('', concept.awareness)}>Sin clasificar</option><option value="UNAWARE" ${selected('UNAWARE', concept.awareness)}>Unaware</option><option value="PAIN" ${selected('PAIN', concept.awareness)}>Problem aware</option><option value="SOL" ${selected('SOL', concept.awareness)}>Solution aware (SOL)</option><option value="PRO" ${selected('PRO', concept.awareness)}>Product aware (PRO)</option></select></label>
        </div>
      </section>
      ${parent ? `<section class="form-section"><div class="form-section-heading"><div><h3>Qué cambió en esta derivación</h3><p>Puede haber más de un cambio.</p></div></div><div class="form-grid two-cols">
        ${['hook', 'persona', 'offer', 'angle', 'format'].map((field) => `<label class="check-field"><input type="checkbox" data-derivation-field="${field}" ${checked(concept.derivationChanges?.[field] || (field === 'hook' && concept.derivationChanges?.creative))} /><span>${derivationLabels[field]}</span></label>`).join('')}
        <label class="field form-grid-full"><span>Nota de intención</span><textarea data-field="derivationNote" rows="3">${escapeHTML(concept.derivationNote || '')}</textarea></label>
      </div></section>` : ''}
      ${warnings.length ? `<section class="form-section"><div class="form-section-heading"><div><h3>Validaciones pendientes</h3><p>Afirmaciones que deben revisarse antes de publicar.</p></div></div><div class="form-grid">${warnings.map((note) => `<div class="callout"><svg><use href="#i-alert" /></svg><div>${escapeHTML(note.text)}</div></div>`).join('')}</div></section>` : ''}`;
  }

  function renderCreativeInspector(client, concept) {
    const executions = concept.executions || [];
    return `
      <section class="form-section">
        <div class="form-section-heading"><div><h3>Ejecuciones creativas</h3><p>Hooks, guiones, escenas, formatos y CTA editables.</p></div><button class="button secondary small" type="button" data-action="add-execution"><svg><use href="#i-plus" /></svg>Nueva</button></div>
        ${executions.length ? `<div class="execution-list">${executions.map((execution, index) => renderExecutionEditor(execution, index)).join('')}</div>` : `<div class="empty-state"><div><svg><use href="#i-image" /></svg><h3>Sin ejecuciones todavía</h3><p>Crea la primera pieza que materialice este concepto.</p><button class="button primary" type="button" data-action="add-execution">Crear ejecución</button></div></div>`}
      </section>`;
  }

  function scenesToText(scenes = []) {
    return scenes.map((scene) => `${scene.direction || ''}${scene.dialogue ? ` | ${scene.dialogue}` : ''}`.trim()).join('\n');
  }

  function renderExecutionEditor(execution, index) {
    const references = (execution.references || []).map((reference) => reference.url || '').filter(Boolean).join('\n');
    return `<details class="execution-editor" data-execution-id="${escapeHTML(execution.id)}" ${index === 0 ? 'open' : ''}>
      <summary><span class="execution-summary-title"><span class="execution-thumb"><svg><use href="#i-image" /></svg></span><span><strong>${escapeHTML(execution.title || `Ejecución ${index + 1}`)}</strong><small>${escapeHTML(execution.format || 'Formato sin definir')}</small></span></span><svg><use href="#i-chevron" /></svg></summary>
      <div class="execution-editor-body">
        <div class="form-grid two-cols"><label class="field"><span>Nombre</span><input data-exec-field="title" value="${escapeHTML(execution.title || '')}" /></label><label class="field"><span>Formato</span><input data-exec-field="format" value="${escapeHTML(execution.format || '')}" placeholder="Video UGC, estático, carrusel…" /></label></div>
        <label class="field"><span>Hook principal</span><textarea data-exec-field="hook" rows="3">${escapeHTML(execution.hook || '')}</textarea></label>
        <label class="field"><span>Variantes de hook</span><textarea data-exec-field="hookVariants" rows="4">${escapeHTML((execution.hookVariants || []).join('\n'))}</textarea><small class="helper">Una variante por línea.</small></label>
        <label class="field"><span>Desarrollo / contenido</span><textarea data-exec-field="content" rows="4">${escapeHTML(execution.content || '')}</textarea></label>
        <label class="field"><span>Guion completo</span><textarea data-exec-field="script" rows="6">${escapeHTML(execution.script || '')}</textarea></label>
        <label class="field"><span>Escenas</span><textarea data-exec-field="scenes" rows="7">${escapeHTML(scenesToText(execution.scenes))}</textarea><small class="helper">Una escena por línea en formato “Dirección | Diálogo”.</small></label>
        <label class="field"><span>CTA</span><input data-exec-field="cta" value="${escapeHTML(execution.cta || '')}" /></label>
        <label class="field"><span>Referencias</span><textarea data-exec-field="references" rows="3">${escapeHTML(references)}</textarea><small class="helper">Una URL por línea.</small></label>
        <div class="execution-actions"><button class="danger-link" type="button" data-action="delete-execution">Eliminar ejecución</button></div>
      </div>
    </details>`;
  }

  function renderMetaInspector(client, concept) {
    const store = getMetaStore(client);
    if (!store) return renderEmpty('Sin cuenta Meta vinculada', 'Este cliente no tiene una cuenta disponible en la fotografía local.', 'i-meta');
    return `
      <section class="form-section">
        <div class="form-section-heading"><div><h3>Cuenta vinculada</h3><p>Datos ficticios de solo lectura; las asociaciones sí se editan localmente.</p></div></div>
        <div class="meta-account-card"><svg><use href="#i-meta" /></svg><div><strong>${escapeHTML(store.account.name)}</strong><small>act_${escapeHTML(store.account.id)} · ${escapeHTML(store.account.status)} · ${escapeHTML(store.account.timezone)}</small></div></div>
      </section>
      <section class="form-section">
        <div class="form-section-heading"><div><h3>Campañas y conjuntos</h3><p>Un concepto puede enlazarse con varios nodos de Meta.</p></div></div>
        <div class="meta-tree">${store.campaigns.map((campaign) => renderCampaignGroup(concept, campaign)).join('')}</div>
      </section>
      <section class="form-section"><div class="callout info"><svg><use href="#i-map" /></svg><div><strong>Funnel por definir.</strong><br />Dejamos este espacio visible, pero sin asumir todavía si será una entidad propia o un enlace del concepto.</div></div></section>`;
  }

  function isMetaLinked(concept, type, id) {
    return (concept.metaLinks || []).some((link) => link.type === type && link.id === id);
  }

  function renderCampaignGroup(concept, campaign) {
    const campaignMetrics = campaign.metrics30d || {};
    return `<section class="campaign-group">
      <label class="campaign-header"><input type="checkbox" data-meta-type="campaign" data-meta-id="${escapeHTML(campaign.id)}" ${checked(isMetaLinked(concept, 'campaign', campaign.id))} /><span><strong>${escapeHTML(campaign.name)}</strong><small>${escapeHTML(campaign.objective || 'Sin objetivo')} · ${escapeHTML(campaign.id)}</small>${renderMetaMetricLine(campaignMetrics)}</span><span class="meta-state">${escapeHTML(campaign.status || '—')}</span></label>
      ${(campaign.adsets || []).length ? `<div class="adset-list">${campaign.adsets.map((adset) => `<label class="adset-row"><input type="checkbox" data-meta-type="adset" data-meta-id="${escapeHTML(adset.id)}" data-campaign-id="${escapeHTML(campaign.id)}" ${checked(isMetaLinked(concept, 'adset', adset.id))} /><span><strong>${escapeHTML(adset.name)}</strong><small>Conjunto · ${escapeHTML(adset.optimization || adset.id)}</small>${renderMetaMetricLine(adset)}</span><span class="meta-state">${escapeHTML(adset.status || '—')}</span></label>`).join('')}</div>` : ''}
    </section>`;
  }

  function renderMetaMetricLine(metrics) {
    if (metrics.spend == null) return '<span class="meta-metrics"><span>Sin entrega en 30 días</span></span>';
    return `<span class="meta-metrics"><span>${money.format(metrics.spend)}</span>${metrics.purchases != null ? `<span>${number.format(metrics.purchases)} compras</span>` : ''}${metrics.messages ? `<span>${number.format(metrics.messages)} conversaciones</span>` : ''}${metrics.roas != null ? `<span>${decimal.format(metrics.roas)}x ROAS</span>` : ''}</span>`;
  }

  function renderResultsInspector(client, concept) {
    const metrics = conceptMetrics(client, concept);
    const signal = !metrics ? 'Sin señal: primero asocia una campaña o conjunto.' : metrics.roas >= 3 ? 'Señal positiva: revisar calidad y decidir si escalar.' : metrics.purchases > 0 ? 'Señal mixta: iterar antes de aumentar presupuesto.' : 'Sin compras atribuidas: revisar objetivo y ventana.';
    return `
      <section class="form-section">
        <div class="form-section-heading"><div><h3>Resultado asociado</h3><p>Agregado ficticio de los nodos Meta vinculados para esta demo.</p></div></div>
        ${metrics ? `<div class="metrics-detail-grid">
          ${metricCard('Inversión', money.format(metrics.spend || 0))}${metricCard('Compras', number.format(metrics.purchases || 0))}${metricCard('Ingresos', money.format(metrics.revenue || 0))}${metricCard('ROAS', `${decimal.format(metrics.roas || 0)}x`)}${metricCard('CPA', metrics.cpa == null ? '—' : money.format(metrics.cpa))}${metricCard('Conversaciones', number.format(metrics.messages || 0))}
        </div>` : `<div class="callout"><svg><use href="#i-alert" /></svg><div>No hay resultados atribuibles porque el concepto no tiene una asociación Meta válida.</div></div>`}
      </section>
      <section class="form-section">
        <div class="decision-card"><h3>Decisión humana</h3><div class="form-grid">
          <label class="field"><span>Decisión</span><select data-field="decision">${decisions.map((item) => `<option value="${item.id}" ${selected(item.id, concept.decision)}>${escapeHTML(item.label)}</option>`).join('')}</select></label>
          <label class="field"><span>Razón</span><textarea data-field="decisionReason" rows="4" placeholder="¿Qué observamos y por qué tomamos esta decisión?">${escapeHTML(concept.decisionReason || '')}</textarea></label>
          <div class="callout info"><svg><use href="#i-chart" /></svg><div><strong>Sugerencia del sistema:</strong><br />${escapeHTML(signal)}</div></div>
        </div></div>
      </section>
      <section class="form-section"><div class="callout info"><svg><use href="#i-alert" /></svg><div>Estas métricas fueron inventadas para mostrar cómo se documenta una decisión creativa.</div></div></section>`;
  }

  function metricCard(label, value) {
    return `<article class="metric-detail-card"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></article>`;
  }

  function renderHistoryInspector(client, concept) {
    const records = [
      ...(concept.notes || []).map((note) => ({ ...note, recordType: note.type || 'internal' })),
      ...(concept.history || []).map((event) => ({ ...event, text: event.text || event.message, recordType: event.type || 'internal' })),
    ].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return `
      <section class="form-section">
        <div class="form-section-heading"><div><h3>Agregar nota</h3><p>Por ahora todo queda guardado en este navegador.</p></div></div>
        <div class="form-grid"><label class="field"><span>Visibilidad / tipo</span><select id="newNoteType"><option value="internal">Nota interna</option><option value="client">Visible al cliente</option><option value="decision">Decisión</option></select></label><label class="field"><span>Contenido</span><textarea id="newNoteText" rows="3" placeholder="Registra el contexto, aprendizaje o siguiente paso."></textarea></label><button class="button secondary" type="button" data-action="add-note"><svg><use href="#i-comment" /></svg>Agregar al historial</button></div>
      </section>
      <section class="form-section"><div class="form-section-heading"><div><h3>Historial del concepto</h3><p>${records.length} registros</p></div></div>${records.length ? `<div class="history-list">${records.map((record) => renderHistoryItem(record)).join('')}</div>` : renderEmpty('Todavía no hay historial', 'Los cambios de estado, notas y asociaciones aparecerán aquí.', 'i-comment')}</section>`;
  }

  function renderHistoryItem(record) {
    const icon = record.recordType === 'warning' ? 'i-alert' : record.recordType === 'meta' ? 'i-meta' : record.recordType === 'status' ? 'i-arrow' : 'i-comment';
    const label = noteTypes[record.recordType] || 'Registro';
    return `<article class="history-item"><span class="history-icon"><svg><use href="#${icon}" /></svg></span><div class="history-content"><strong>${escapeHTML(label)}</strong><p>${escapeHTML(record.text || '')}</p><small>${escapeHTML(formatLocalDate(record.createdAt))}</small></div></article>`;
  }

  function formatLocalDate(value) {
    if (!value) return 'Sin fecha';
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: value.includes('T') ? 'short' : undefined }).format(date);
  }

  function updateAutosave(saving) {
    if (!els.autosaveState) return;
    els.autosaveState.innerHTML = saving ? '<svg><use href="#i-reset" /></svg>Guardando…' : '<svg><use href="#i-check" /></svg>Guardado localmente';
  }

  function setSimpleInspectorMenu(open) {
    const wrapper = $('#simpleInspectorMore');
    const button = $('#simpleInspectorMoreBtn');
    const menu = $('#simpleInspectorMenu');
    if (!wrapper || !button || !menu) return;
    wrapper.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
  }

  function selectClient(clientId) {
    if (!state.clients.some((client) => client.id === clientId)) return;
    ui.selectedClientId = clientId;
    ui.selectedProductId = 'all';
    ui.status = 'all';
    ui.search = '';
    els.statusFilter.value = 'all';
    els.simpleStatusFilter.value = 'all';
    els.conceptSearch.value = '';
    els.simpleConceptSearch.value = '';
    if (ui.inspectorConceptId && findConcept(ui.inspectorConceptId)?.client.id !== ui.selectedClientId) closeInspector();
    renderAll();
    saveNow();
  }

  function bindEvents() {
    $$('[data-mode]').forEach((button) => button.addEventListener('click', () => {
      ui.mode = button.dataset.mode;
      renderAll();
      saveNow();
    }));
    els.clientSearch.addEventListener('input', (event) => {
      ui.clientSearch = event.target.value;
      renderClientList();
      saveNow();
    });
    els.clientList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-client-id]');
      if (!button) return;
      selectClient(button.dataset.clientId);
    });
    els.simpleClientList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-simple-client-id]');
      if (!button) return;
      selectClient(button.dataset.simpleClientId);
    });
    els.productFilters.addEventListener('click', (event) => {
      const button = event.target.closest('[data-product-id]');
      if (!button) return;
      ui.selectedProductId = button.dataset.productId;
      renderProductFilters();
      renderSimpleFilters();
      renderView();
      renderSimpleView();
      saveNow();
    });
    els.statusFilter.addEventListener('change', (event) => {
      ui.status = event.target.value;
      els.simpleStatusFilter.value = ui.status;
      renderView();
      renderSimpleView();
      saveNow();
    });
    els.conceptSearch.addEventListener('input', (event) => {
      ui.search = event.target.value;
      els.simpleConceptSearch.value = ui.search;
      renderView();
      renderSimpleView();
      saveNow();
    });
    els.simpleProductFilter.addEventListener('change', (event) => {
      ui.selectedProductId = event.target.value;
      renderProductFilters();
      renderSimpleView();
      saveNow();
    });
    els.simpleStatusFilter.addEventListener('change', (event) => {
      ui.status = event.target.value;
      els.statusFilter.value = ui.status;
      renderSimpleView();
      saveNow();
    });
    els.simpleConceptSearch.addEventListener('input', (event) => {
      ui.search = event.target.value;
      els.conceptSearch.value = ui.search;
      renderSimpleView();
      saveNow();
    });
    els.dateRange.addEventListener('change', (event) => {
      ui.dateRange = Number(event.target.value);
      renderKpis();
      saveNow();
    });
    $$('.view-tab').forEach((tab) => tab.addEventListener('click', () => {
      ui.view = tab.dataset.view;
      renderViewTabs();
      renderView();
      saveNow();
    }));
    els.viewRoot.addEventListener('click', handleViewClick);
    els.viewRoot.addEventListener('dragstart', handleDragStart);
    els.viewRoot.addEventListener('dragend', handleDragEnd);
    els.viewRoot.addEventListener('dragover', handleDragOver);
    els.viewRoot.addEventListener('dragleave', handleDragLeave);
    els.viewRoot.addEventListener('drop', handleDrop);
    els.simpleViewRoot.addEventListener('dragstart', handleDragStart);
    els.simpleViewRoot.addEventListener('dragend', handleDragEnd);
    els.simpleViewRoot.addEventListener('dragover', handleDragOver);
    els.simpleViewRoot.addEventListener('dragleave', handleDragLeave);
    els.simpleViewRoot.addEventListener('drop', handleDrop);
    els.simpleViewRoot.addEventListener('change', (event) => {
      if (event.target.matches('[data-cascade-client]')) {
        selectClient(event.target.value);
        return;
      }
      if (event.target.matches('[data-cascade-product]')) {
        ui.selectedProductId = event.target.value;
        renderProductFilters();
        renderSimpleFilters();
        renderSimpleView();
        saveNow();
        return;
      }
      if (event.target.matches('[data-cascade-status]')) {
        ui.status = event.target.value;
        els.statusFilter.value = ui.status;
        els.simpleStatusFilter.value = ui.status;
        renderSimpleFilters();
        renderSimpleView();
        saveNow();
      }
    });
    els.simpleViewRoot.addEventListener('input', (event) => {
      if (!event.target.matches('[data-cascade-search]')) return;
      const caret = event.target.selectionStart ?? event.target.value.length;
      const scrollTop = $('.cascade-tree-scroll', els.simpleViewRoot)?.scrollTop || 0;
      ui.search = event.target.value;
      els.conceptSearch.value = ui.search;
      els.simpleConceptSearch.value = ui.search;
      renderSimpleView();
      saveNow();
      requestAnimationFrame(() => {
        const next = $('[data-cascade-search]', els.simpleViewRoot);
        if (!next) return;
        next.focus();
        next.setSelectionRange(caret, caret);
        const scroll = $('.cascade-tree-scroll', els.simpleViewRoot);
        if (scroll) scroll.scrollTop = scrollTop;
      });
    });
    els.simpleViewRoot.addEventListener('click', (event) => {
      if (event.target.closest('[data-clear-simple-filters]')) {
        ui.selectedProductId = 'all';
        ui.status = 'all';
        ui.search = '';
        els.statusFilter.value = 'all';
        els.conceptSearch.value = '';
        renderProductFilters();
        renderSimpleFilters();
        renderSimpleView();
        saveNow();
        return;
      }
      const deriveButton = event.target.closest('[data-builder-derive]');
      if (deriveButton) {
        openDeriveDialog(deriveButton.dataset.builderDerive);
        return;
      }
      const mapTabButton = event.target.closest('[data-map-concept-tab]');
      if (mapTabButton) {
        openInspector(mapTabButton.dataset.mapConceptId, mapTabButton.dataset.mapConceptTab);
        return;
      }
      const mapToggle = event.target.closest('[data-map-toggle]');
      if (mapToggle) {
        const nodeId = mapToggle.dataset.mapToggle;
        const collapsed = new Set(ui.collapsedMapNodeIds);
        if (collapsed.has(nodeId)) collapsed.delete(nodeId);
        else collapsed.add(nodeId);
        ui.collapsedMapNodeIds = [...collapsed];
        renderSimpleView();
        saveNow();
        requestAnimationFrame(() => els.simpleViewRoot.querySelector(`[data-map-toggle="${CSS.escape(nodeId)}"]`)?.focus());
        return;
      }
      const moveButton = event.target.closest('[data-move-concept]');
      if (moveButton && moveButton.dataset.moveStatus) {
        const found = findConcept(moveButton.dataset.moveConcept);
        if (!found) return;
        moveConceptToStatus(found, moveButton.dataset.moveStatus, { restoreFocus: true });
        return;
      }
      handleViewClick(event);
    });
    els.conceptEditorSlot.addEventListener('click', (event) => {
      if (event.target.closest('[data-editor-create-base]')) openNewConceptDialog();
    });

    els.newConceptBtn.addEventListener('click', () => openNewConceptDialog());
    $('#exportBtn').addEventListener('click', exportData);
    $('#importBtn').addEventListener('click', () => els.importInput.click());
    els.importInput.addEventListener('change', importData);
    $('#resetBtn').addEventListener('click', resetData);

    $('#closeInspectorBtn').addEventListener('click', closeInspector);
    els.drawerBackdrop.addEventListener('click', closeInspector);
    $$('.inspector-tab').forEach((tab) => tab.addEventListener('click', () => {
      ui.inspectorTab = tab.dataset.tab;
      renderInspector();
      saveNow();
    }));
    els.quickStatus.addEventListener('change', () => {
      const found = findConcept(ui.inspectorConceptId);
      if (!found) return;
      setConceptStatus(found.client, found.concept, els.quickStatus.value);
      renderInspector();
      renderView();
      renderSimpleSummary();
      renderSimpleView();
      renderClientList();
      renderSimpleClientList();
    });
    $('#saveInspectorBtn').addEventListener('click', () => saveNow({ feedback: true }));
    $('#duplicateBtn').addEventListener('click', () => cloneCurrentConcept('duplicate'));
    $('#deriveBtn').addEventListener('click', () => openDeriveDialog(ui.inspectorConceptId));
    $('#deleteConceptBtn').addEventListener('click', deleteCurrentConcept);
    $('#simpleInspectorMoreBtn').addEventListener('click', () => setSimpleInspectorMenu(!$('#simpleInspectorMore').classList.contains('open')));
    $('#simpleDuplicateBtn').addEventListener('click', () => {
      setSimpleInspectorMenu(false);
      cloneCurrentConcept('duplicate');
    });
    $('#simpleDeleteBtn').addEventListener('click', () => {
      setSimpleInspectorMenu(false);
      deleteCurrentConcept();
    });
    els.inspectorBody.addEventListener('input', handleInspectorInput);
    els.inspectorBody.addEventListener('change', handleInspectorChange);
    els.inspectorBody.addEventListener('click', handleInspectorClick);

    $('#newClient').addEventListener('change', populateNewProducts);
    $('#newProduct').addEventListener('change', populateNewTerritories);
    els.form.addEventListener('submit', handleCreateConcept);
    $$('[value="cancel"]', els.dialog).forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault();
      els.dialog.close();
    }));
    els.deriveForm.addEventListener('submit', handleCreateDerivation);
    $$('[value="cancel"]', els.deriveDialog).forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault();
      els.deriveDialog.close();
    }));
    $$('[name="deriveChange"]', els.deriveDialog).forEach((input) => input.addEventListener('change', () => {
      els.deriveError.hidden = Boolean($('[name="deriveChange"]:checked', els.deriveDialog));
    }));

    $$('.nav-item:not(.active)').forEach((button) => button.addEventListener('click', () => showToast('Fuera de este laboratorio', 'Esta navegación es visual; no abre ni modifica módulos oficiales.')));
    document.addEventListener('click', (event) => {
      const menu = $('#simpleInspectorMore');
      if (menu?.classList.contains('open') && !menu.contains(event.target)) setSimpleInspectorMenu(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      const menu = $('#simpleInspectorMore');
      if (menu?.classList.contains('open')) {
        setSimpleInspectorMenu(false);
        $('#simpleInspectorMoreBtn')?.focus();
        return;
      }
      if (ui.mode !== 'conceptual' && els.inspector.classList.contains('open') && !els.dialog.open && !els.deriveDialog.open) closeInspector();
    });
    window.addEventListener('resize', scheduleConceptMapConnections);
    if ('ResizeObserver' in window) {
      conceptMapResizeObserver = new ResizeObserver(scheduleConceptMapConnections);
      conceptMapResizeObserver.observe(els.simpleViewRoot);
    }
    document.fonts?.ready.then(scheduleConceptMapConnections);
    window.addEventListener('beforeunload', () => saveNow());
  }

  function handleViewClick(event) {
    const conceptTrigger = event.target.closest('[data-concept-id]');
    if (conceptTrigger) {
      openInspector(conceptTrigger.dataset.conceptId);
      return;
    }
    const emptyAdd = event.target.closest('[data-empty-add]');
    if (emptyAdd) openNewConceptDialog(emptyAdd.dataset.emptyAdd, emptyAdd.dataset.territoryId || null);
  }

  function handleDragStart(event) {
    const card = event.target.closest('[data-drag-concept]');
    if (!card) return;
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.dragConcept);
  }

  function handleDragEnd(event) {
    event.target.closest('[data-drag-concept]')?.classList.remove('dragging');
    $$('.board-column.drag-over, .kanban-column.drag-over').forEach((column) => column.classList.remove('drag-over'));
  }

  function handleDragOver(event) {
    const column = event.target.closest('[data-drop-status]');
    if (!column) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    column.classList.add('drag-over');
  }

  function handleDragLeave(event) {
    const column = event.target.closest('[data-drop-status]');
    if (column && !column.contains(event.relatedTarget)) column.classList.remove('drag-over');
  }

  function handleDrop(event) {
    const column = event.target.closest('[data-drop-status]');
    if (!column) return;
    event.preventDefault();
    column.classList.remove('drag-over');
    const found = findConcept(event.dataTransfer.getData('text/plain'));
    if (!found || found.concept.status === column.dataset.dropStatus) return;
    if (column.classList.contains('kanban-column') && kanbanStageIndex(found.concept.status) === kanbanStageIndex(column.dataset.dropStatus)) return;
    moveConceptToStatus(found, column.dataset.dropStatus);
  }

  function moveConceptToStatus(found, statusId, { restoreFocus = false, feedback = true } = {}) {
    if (!found || !statusId || found.concept.status === statusId) return false;
    const previousStatus = found.concept.status;
    const conceptId = found.concept.id;
    const conceptTitle = found.concept.title;
    setConceptStatus(found.client, found.concept, statusId);
    renderSimpleSummary();
    renderSimpleView();
    renderView();
    renderClientList();
    renderSimpleClientList();
    if (restoreFocus) {
      requestAnimationFrame(() => {
        els.simpleViewRoot.querySelector(`[data-concept-id="${CSS.escape(conceptId)}"]`)?.focus();
      });
    }
    if (feedback) {
      showToast('Concepto movido', `${conceptTitle} pasó a ${getStatus(statusId).label}.`, 'success', {
        label: 'Deshacer',
        callback: () => {
          const current = findConcept(conceptId);
          if (!current) return;
          moveConceptToStatus(current, previousStatus, { restoreFocus, feedback: false });
        },
      });
    }
    return true;
  }

  function setConceptStatus(client, concept, statusId) {
    const previous = getStatus(concept.status).label;
    concept.status = statusId;
    addHistory(concept, 'status', `Estado: ${previous} → ${getStatus(statusId).label}.`);
    scheduleSave();
  }

  function handleInspectorInput(event) {
    const found = findConcept(ui.inspectorConceptId);
    if (!found) return;
    const target = event.target;
    if (target.matches('[data-field]') && target.tagName !== 'SELECT') {
      updateConceptField(found.client, found.concept, target.dataset.field, target.value, false);
      return;
    }
    if (target.matches('[data-exec-field]') && target.tagName !== 'SELECT') {
      const editor = target.closest('[data-execution-id]');
      const execution = found.concept.executions.find((item) => item.id === editor?.dataset.executionId);
      if (!execution) return;
      updateExecutionField(execution, target.dataset.execField, target.value);
      if (target.dataset.execField === 'title') editor.querySelector('.execution-summary-title strong').textContent = target.value || 'Ejecución sin nombre';
      scheduleSave();
      scheduleViewRender();
    }
  }

  function handleInspectorChange(event) {
    const found = findConcept(ui.inspectorConceptId);
    if (!found) return;
    const target = event.target;
    if (target.matches('[data-meta-type]')) {
      toggleMetaLink(found.concept, target.dataset.metaType, target.dataset.metaId, target.dataset.campaignId || null, target.checked);
      renderInspector();
      renderView();
      return;
    }
    if (target.matches('[data-derivation-field]')) {
      found.concept.derivationChanges ||= {};
      found.concept.derivationChanges[target.dataset.derivationField] = target.checked;
      scheduleSave();
      return;
    }
    if (target.matches('[data-field]')) {
      const structural = ['productId', 'territoryId'].includes(target.dataset.field);
      updateConceptField(found.client, found.concept, target.dataset.field, target.value, structural);
      return;
    }
    if (target.matches('[data-exec-field]')) {
      const editor = target.closest('[data-execution-id]');
      const execution = found.concept.executions.find((item) => item.id === editor?.dataset.executionId);
      if (!execution) return;
      updateExecutionField(execution, target.dataset.execField, target.value);
      scheduleSave();
      scheduleViewRender();
    }
  }

  function handleInspectorClick(event) {
    const sectionButton = event.target.closest('[data-simple-editor-section]');
    if (sectionButton) {
      ui.simpleEditorSection = normalizeSimpleEditorSection(sectionButton.dataset.simpleEditorSection);
      renderInspector();
      saveNow();
      requestAnimationFrame(() => $('[data-sheet-subview-heading]', els.inspectorBody)?.focus());
      return;
    }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'add-execution') addExecution();
    if (action === 'delete-execution') deleteExecution(event.target.closest('[data-execution-id]')?.dataset.executionId);
    if (action === 'add-note') addNote();
  }

  function updateConceptField(client, concept, field, value, structural) {
    if (field === 'productId' && value !== concept.productId) {
      detachConceptFromTerritory(client, concept);
      concept.productId = value;
      concept.territoryId = getProduct(client, value)?.territories?.[0]?.id || '';
      attachConceptToTerritory(client, concept);
    } else if (field === 'territoryId' && value !== concept.territoryId) {
      detachConceptFromTerritory(client, concept);
      concept.territoryId = value;
      attachConceptToTerritory(client, concept);
    } else {
      concept[field] = value;
    }
    if (field === 'title') els.inspectorTitle.textContent = value || 'Concepto sin nombre';
    scheduleSave();
    scheduleViewRender();
    if (structural) renderInspector();
  }

  function updateExecutionField(execution, field, value) {
    if (field === 'hookVariants') execution.hookVariants = value.split('\n').map((line) => line.trim()).filter(Boolean);
    else if (field === 'references') execution.references = value.split('\n').map((line) => line.trim()).filter(Boolean).map((url, index) => ({ type: 'url', label: `Referencia ${index + 1}`, url }));
    else if (field === 'scenes') execution.scenes = value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const separator = line.indexOf('|');
      return { id: uid('scene'), direction: separator >= 0 ? line.slice(0, separator).trim() : line, dialogue: separator >= 0 ? line.slice(separator + 1).trim() : '' };
    });
    else execution[field] = value;
  }

  function detachConceptFromTerritory(client, concept) {
    const territory = getTerritory(client, concept.productId, concept.territoryId);
    if (territory) territory.conceptIds = (territory.conceptIds || []).filter((id) => id !== concept.id);
  }

  function attachConceptToTerritory(client, concept) {
    const territory = getTerritory(client, concept.productId, concept.territoryId);
    if (territory && !(territory.conceptIds || []).includes(concept.id)) territory.conceptIds.push(concept.id);
  }

  function addExecution() {
    const found = findConcept(ui.inspectorConceptId);
    if (!found) return;
    const execution = {
      id: uid('execution'),
      parentId: found.concept.id,
      derivedFrom: null,
      title: `Nueva ejecución ${found.concept.executions.length + 1}`,
      format: '',
      hook: '',
      hookVariants: [],
      content: '',
      script: '',
      scenes: [],
      cta: '',
      references: [],
      awareness: found.concept.awareness || null,
      metaLinks: [],
      metrics: {},
    };
    found.concept.executions.push(execution);
    addHistory(found.concept, 'internal', `Se creó la ejecución “${execution.title}”.`);
    scheduleSave();
    renderInspector();
    renderView();
  }

  function deleteExecution(executionId) {
    const found = findConcept(ui.inspectorConceptId);
    if (!found) return;
    const execution = found.concept.executions.find((item) => item.id === executionId);
    if (!execution || !confirm(`¿Eliminar la ejecución “${execution.title}”?`)) return;
    found.concept.executions = found.concept.executions.filter((item) => item.id !== executionId);
    addHistory(found.concept, 'internal', `Se eliminó la ejecución “${execution.title}”.`);
    scheduleSave();
    renderInspector();
    renderView();
    showToast('Ejecución eliminada', 'El cambio quedó guardado localmente.');
  }

  function toggleMetaLink(concept, type, id, campaignId, enabled) {
    concept.metaLinks ||= [];
    if (enabled) {
      if (!concept.metaLinks.some((link) => link.type === type && link.id === id)) concept.metaLinks.push({ type, id, ...(campaignId ? { campaignId } : {}) });
      if (type === 'adset' && campaignId && !concept.metaLinks.some((link) => link.type === 'campaign' && link.id === campaignId)) concept.metaLinks.push({ type: 'campaign', id: campaignId });
    } else concept.metaLinks = concept.metaLinks.filter((link) => !(link.type === type && link.id === id));
    addHistory(concept, 'meta', `${enabled ? 'Se vinculó' : 'Se desvinculó'} ${type === 'adset' ? 'el conjunto' : 'la campaña'} ${id}.`);
    scheduleSave();
  }

  function addNote() {
    const found = findConcept(ui.inspectorConceptId);
    const text = $('#newNoteText', els.inspectorBody)?.value.trim();
    const type = $('#newNoteType', els.inspectorBody)?.value || 'internal';
    if (!found || !text) {
      showToast('Falta contenido', 'Escribe una nota antes de agregarla.', 'error');
      return;
    }
    found.concept.notes.push({ id: uid('note'), type, text, createdAt: new Date().toISOString() });
    scheduleSave();
    renderInspector();
    showToast('Nota agregada', `Visibilidad: ${noteTypes[type]}.`, 'success');
  }

  function addHistory(concept, type, text) {
    concept.history ||= [];
    concept.history.push({ id: uid('history'), type, text, createdAt: new Date().toISOString() });
  }

  function cloneCurrentConcept(mode) {
    const found = findConcept(ui.inspectorConceptId);
    if (!found) return;
    if (mode === 'derive') {
      openDeriveDialog(found.concept.id);
      return;
    }
    createConceptClone(found, { mode: 'duplicate' });
  }

  function createConceptClone(found, { mode, title = '', changes = {}, note = '' }) {
    const original = found.concept;
    const clone = deepClone(original);
    const isDerivation = mode === 'derive';
    clone.id = uid('concept');
    clone.title = title || `${original.title} · ${isDerivation ? 'Derivación' : 'Copia'}`;
    clone.status = isDerivation ? 'idea' : 'draft';
    clone.derivedFrom = isDerivation ? original.id : null;
    clone.derivationChanges = isDerivation ? changes : {};
    clone.derivationNote = isDerivation ? note : '';
    clone.metaLinks = [];
    clone.metrics = {};
    clone.decision = '';
    clone.decisionReason = '';
    clone.notes = isDerivation
      ? [{ id: uid('note'), type: 'source', text: `Derivado de “${original.title}”.${note ? ` Intención: ${note}` : ''}`, createdAt: new Date().toISOString() }]
      : [];
    clone.history = [{ id: uid('history'), type: 'internal', text: isDerivation ? `Derivación creada desde “${original.title}”.` : `Copia creada desde “${original.title}”.`, createdAt: new Date().toISOString() }];
    clone.executions = isDerivation ? [] : (clone.executions || []).map((execution) => ({
      ...execution,
      id: uid('execution'),
      parentId: clone.id,
      derivedFrom: null,
      title: `${execution.title} · Copia`,
      metaLinks: [],
      metrics: {},
      scenes: (execution.scenes || []).map((scene) => ({ ...scene, id: uid('scene') })),
    }));
    found.client.concepts.push(clone);
    attachConceptToTerritory(found.client, clone);
    ui.mode = 'conceptual';
    ui.selectedClientId = found.client.id;
    ui.selectedProductId = clone.productId;
    ui.status = 'all';
    ui.search = '';
    ui.inspectorConceptId = clone.id;
    ui.inspectorTab = 'strategy';
    scheduleSave();
    renderAll();
    renderInspector();
    openInspector(clone.id, 'strategy');
    showToast(isDerivation ? 'Derivación creada' : 'Concepto duplicado', isDerivation ? 'La nueva rama heredó el contexto y está lista para personalizarse.' : 'La copia está lista para editarse.', 'success');
    return clone;
  }

  function openDeriveDialog(conceptId) {
    const found = findConcept(conceptId);
    if (!found) return;
    const product = getProduct(found.client, found.concept.productId);
    const territory = getTerritory(found.client, found.concept.productId, found.concept.territoryId);
    els.deriveDialog.dataset.parentId = found.concept.id;
    els.deriveSource.innerHTML = `
      <span class="derivation-source-icon"><svg aria-hidden="true"><use href="#i-branch" /></svg></span>
      <div><small>Derivando desde</small><strong>${escapeHTML(found.concept.title)}</strong><span>${escapeHTML(product?.name || 'Sin producto')} · ${escapeHTML(territory?.name || 'Sin territorio')}</span></div>`;
    $$('[name="deriveChange"]', els.deriveDialog).forEach((input) => { input.checked = false; });
    $('#deriveTitle').value = `${found.concept.title} · Variante`;
    $('#deriveNote').value = '';
    els.deriveError.hidden = true;
    els.deriveDialog.showModal();
    setTimeout(() => $('[name="deriveChange"]', els.deriveDialog)?.focus(), 50);
  }

  function handleCreateDerivation(event) {
    event.preventDefault();
    const found = findConcept(els.deriveDialog.dataset.parentId);
    if (!found) {
      els.deriveDialog.close();
      showToast('No pudimos crear la rama', 'El concepto de origen ya no está disponible.', 'error');
      return;
    }
    const selectedChanges = $$('[name="deriveChange"]:checked', els.deriveDialog).map((input) => input.value);
    if (!selectedChanges.length) {
      els.deriveError.hidden = false;
      $('[name="deriveChange"]', els.deriveDialog)?.focus();
      return;
    }
    const title = $('#deriveTitle').value.trim();
    if (!title) {
      $('#deriveTitle').focus();
      $('#deriveTitle').reportValidity();
      return;
    }
    const changes = Object.fromEntries(selectedChanges.map((field) => [field, true]));
    const note = $('#deriveNote').value.trim();
    els.deriveDialog.close();
    createConceptClone(found, { mode: 'derive', title, changes, note });
  }

  function deleteCurrentConcept() {
    const found = findConcept(ui.inspectorConceptId);
    const directChildren = found?.client.concepts.filter((concept) => concept.derivedFrom === found.concept.id) || [];
    if (directChildren.length) {
      showToast('Esta tarjeta tiene derivaciones', `Primero elimina o reorganiza sus ${directChildren.length} ${directChildren.length === 1 ? 'rama hija' : 'ramas hijas'} para no perder el origen.`, 'error');
      return;
    }
    if (!found || !confirm(`¿Eliminar el concepto “${found.concept.title}”? Podrás deshacerlo durante unos segundos.`)) return;
    const index = found.client.concepts.findIndex((concept) => concept.id === found.concept.id);
    lastDeleted = { clientId: found.client.id, concept: deepClone(found.concept), index };
    detachConceptFromTerritory(found.client, found.concept);
    found.client.concepts.splice(index, 1);
    closeInspector();
    saveNow();
    renderAll();
    showToast('Concepto eliminado', 'Se quitó únicamente del almacenamiento local.', 'default', { label: 'Deshacer', callback: restoreDeletedConcept });
  }

  function restoreDeletedConcept() {
    if (!lastDeleted) return;
    const client = getClient(lastDeleted.clientId);
    client.concepts.splice(Math.max(0, lastDeleted.index), 0, lastDeleted.concept);
    attachConceptToTerritory(client, lastDeleted.concept);
    ui.selectedClientId = client.id;
    saveNow();
    renderAll();
    openInspector(lastDeleted.concept.id);
    lastDeleted = null;
    showToast('Concepto restaurado', 'La eliminación fue revertida.', 'success');
  }

  function openNewConceptDialog(productId = null, territoryId = null) {
    const client = getClient();
    $('#newClient').innerHTML = state.clients.map((item) => `<option value="${escapeHTML(item.id)}" ${selected(item.id, client.id)}>${escapeHTML(item.name)}</option>`).join('');
    els.newClientContext.innerHTML = `<span class="simple-client-avatar" style="--client-color:${escapeHTML(client.color || '#7c3aed')}">${escapeHTML(initials(client.name))}</span><div><small>Creando para</small><strong>${escapeHTML(client.name)}</strong><span>El cliente quedará heredado en todas sus futuras derivaciones.</span></div>`;
    els.dialog.dataset.preferredProduct = productId || (ui.selectedProductId !== 'all' ? ui.selectedProductId : '');
    els.dialog.dataset.preferredTerritory = territoryId || '';
    populateNewProducts();
    $('#newTitle').value = '';
    $('#newPersona').value = '';
    $('#newOffer').value = '';
    $('#newAngle').value = '';
    $('#newAwareness').value = '';
    $('#newStatus').value = 'idea';
    const progressive = $('.progressive-fields', els.dialog);
    if (progressive) progressive.open = false;
    els.dialog.showModal();
    setTimeout(() => $('#newTitle').focus(), 50);
  }

  function populateNewProducts() {
    const client = getClient($('#newClient').value);
    const preferred = els.dialog.dataset.preferredProduct;
    $('#newProduct').innerHTML = client.products.map((product) => `<option value="${escapeHTML(product.id)}">${escapeHTML(product.name)}</option>`).join('');
    if (client.products.some((product) => product.id === preferred)) $('#newProduct').value = preferred;
    populateNewTerritories();
  }

  function populateNewTerritories() {
    const client = getClient($('#newClient').value);
    const product = getProduct(client, $('#newProduct').value);
    const territories = product?.territories || [];
    $('#newTerritory').innerHTML = territories.length
      ? territories.map((territory) => `<option value="${escapeHTML(territory.id)}">${escapeHTML(territory.name)}</option>`).join('')
      : '<option value="__general__">Territorio general (se creará)</option>';
    const preferred = els.dialog.dataset.preferredTerritory;
    if (territories.some((territory) => territory.id === preferred)) $('#newTerritory').value = preferred;
    els.dialog.dataset.preferredProduct = '';
    els.dialog.dataset.preferredTerritory = '';
  }

  function handleCreateConcept(event) {
    event.preventDefault();
    const client = getClient($('#newClient').value);
    const product = getProduct(client, $('#newProduct').value);
    const title = $('#newTitle').value.trim();
    if (!client || !product || !title) {
      showToast('Revisa los campos', 'Cliente, producto y nombre son obligatorios.', 'error');
      return;
    }
    let territoryId = $('#newTerritory').value;
    if (territoryId === '__general__') {
      const territory = { id: uid('territory'), name: 'Territorio general', thesis: 'Tesis pendiente de definir.', conceptIds: [] };
      product.territories.push(territory);
      territoryId = territory.id;
    }
    const concept = {
      id: uid('concept'),
      clientId: client.id,
      productId: product.id,
      territoryId,
      parentId: territoryId,
      title,
      persona: $('#newPersona').value.trim(),
      offer: $('#newOffer').value.trim(),
      angle: $('#newAngle').value.trim(),
      awareness: $('#newAwareness').value || null,
      status: $('#newStatus').value,
      derivedFrom: null,
      derivationChanges: {},
      derivationNote: '',
      metaLinks: [],
      metrics: {},
      executions: [],
      notes: [],
      history: [{ id: uid('history'), type: 'internal', text: 'Concepto creado en el laboratorio local.', createdAt: new Date().toISOString() }],
    };
    client.concepts.push(concept);
    attachConceptToTerritory(client, concept);
    ui.selectedClientId = client.id;
    ui.selectedProductId = product.id;
    ui.status = 'all';
    ui.search = '';
    ui.mode = 'conceptual';
    els.statusFilter.value = 'all';
    els.dialog.close();
    saveNow();
    renderAll();
    openInspector(concept.id);
    showToast('Concepto creado', 'Ahora puedes completar estrategia, creativos y asociaciones.', 'success');
  }

  function exportData() {
    saveNow();
    const payload = {
      schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      metaSnapshot: { capturedAt: metaSnapshot.capturedAt, source: 'public-demo' },
      data: state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `plasa-conceptos-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('Exportación lista', 'Se descargó una copia JSON de tu trabajo local.', 'success');
  }

  async function importData(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const data = payload?.data || payload;
      if (!Array.isArray(data?.clients) || !data.clients.length) throw new Error('El archivo no contiene clientes válidos.');
      if (!confirm('¿Reemplazar los datos locales actuales con este archivo?')) return;
      state = normalizeState(deepClone(data));
      ui.selectedClientId = state.clients[0].id;
      ui.selectedProductId = 'all';
      ui.status = 'all';
      ui.search = '';
      ui.mode = 'conceptual';
      ui.conceptMapIntroduced = true;
      ui.manualBuilderIntroduced = true;
      ui.collapsedMapNodeIds = [];
      ui.view = 'map';
      ui.inspectorConceptId = null;
      saveNow();
      renderStaticOptions();
      renderAll();
      showToast('Importación completada', 'Los datos del archivo ya están activos.', 'success');
    } catch (error) {
      showToast('No pudimos importar', error.message || 'El JSON no tiene el formato esperado.', 'error');
    }
  }

  function resetData() {
    if (!confirm('¿Restaurar los datos iniciales de la demo? Se perderán los cambios locales no exportados.')) return;
    state = normalizeState(deepClone(seed));
    ui = {
      selectedClientId: state.clients[0].id,
      selectedProductId: 'all',
      status: 'all',
      search: '',
      clientSearch: '',
      mode: 'conceptual',
      conceptMapIntroduced: true,
      manualBuilderIntroduced: true,
      collapsedMapNodeIds: [],
      view: 'map',
      dateRange: 30,
      inspectorConceptId: null,
      inspectorTab: 'strategy',
    };
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(UI_KEY);
    closeInspector();
    renderStaticOptions();
    renderAll();
    saveNow();
    showToast('Datos restaurados', 'Volvimos a los datos ficticios iniciales de la demo.', 'success');
  }

  function showToast(title, message, type = 'default', action = null) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'error' ? 'i-alert' : type === 'success' ? 'i-check' : 'i-bulb';
    toast.innerHTML = `<svg><use href="#${icon}" /></svg><div class="toast-copy"><strong></strong><small></small></div>`;
    $('strong', toast).textContent = title;
    $('small', toast).textContent = message;
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast-action';
      button.textContent = action.label;
      button.addEventListener('click', () => {
        action.callback();
        toast.remove();
      });
      toast.append(button);
    }
    els.toastRegion.append(toast);
    setTimeout(() => toast.remove(), action ? 7000 : 4300);
  }

  init();
})();
