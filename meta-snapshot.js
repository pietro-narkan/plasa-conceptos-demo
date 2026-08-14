/* Métricas inventadas para demostrar asociaciones y decisiones sin exponer clientes. */
window.META_SNAPSHOT = {
  capturedAt: null,
  partialDay: false,
  currency: "CLP",
  definitions: {
    results: "Compras ficticias de demostración",
    revenue: "Ingresos ficticios de demostración",
    roas: "ROAS ficticio",
    messages: "Conversaciones ficticias",
  },
  stores: [
    {
      clientId: "client-casa-aurora",
      storeId: "demo-aurora",
      storeName: "Casa Aurora — Demo",
      account: { id: "demo-aurora", name: "Cuenta demo · Casa Aurora", status: "DEMO", timezone: "America/Santiago" },
      windows: {
        7: { range: "demo", spend: 42000, impressions: 8700, reach: 5900, clicks: 380, ctr: 4.37, cpc: 110.53, purchases: 6, revenue: 201600, roas: 4.8, cpa: 7000, messages: 18 },
        14: { range: "demo", spend: 81000, impressions: 17100, reach: 10300, clicks: 750, ctr: 4.39, cpc: 108, purchases: 11, revenue: 388800, roas: 4.8, cpa: 7363.64, messages: 31 },
        30: { range: "demo", spend: 168000, impressions: 35800, reach: 20900, clicks: 1580, ctr: 4.41, cpc: 106.33, purchases: 23, revenue: 806400, roas: 4.8, cpa: 7304.35, messages: 67 },
      },
      campaigns: [
        {
          id: "demo-campaign-aurora",
          name: "Demo · Rituales de calma",
          status: "DEMO",
          objective: "OUTCOME_SALES",
          metrics30d: { spend: 168000, purchases: 23, revenue: 806400, roas: 4.8, cpa: 7304.35, ctr: 4.41, cpc: 106.33 },
          adsets: [
            { id: "demo-adset-calma", name: "Demo · Cierre del día", status: "DEMO", optimization: "OFFSITE_CONVERSIONS", spend: 94000, purchases: 15, revenue: 489000, roas: 5.2, cpa: 6266.67, ctr: 4.9, cpc: 98.5, messages: 39 },
            { id: "demo-adset-diseno", name: "Demo · Espacios pequeños", status: "DEMO", optimization: "OFFSITE_CONVERSIONS", spend: 74000, purchases: 8, revenue: 317400, roas: 4.29, cpa: 9250, ctr: 3.8, cpc: 118.2, messages: 28 },
          ],
        },
      ],
    },
    {
      clientId: "client-nomada-cafe",
      storeId: "demo-nomada",
      storeName: "Nómada Café — Demo",
      account: { id: "demo-nomada", name: "Cuenta demo · Nómada Café", status: "DEMO", timezone: "America/Santiago" },
      windows: {
        7: { range: "demo", spend: 36000, impressions: 9200, reach: 6100, clicks: 510, ctr: 5.54, cpc: 70.59, purchases: 9, revenue: 171000, roas: 4.75, cpa: 4000, messages: 24 },
        14: { range: "demo", spend: 72000, impressions: 18500, reach: 11200, clicks: 1040, ctr: 5.62, cpc: 69.23, purchases: 18, revenue: 351000, roas: 4.88, cpa: 4000, messages: 49 },
        30: { range: "demo", spend: 149000, impressions: 38200, reach: 22400, clicks: 2170, ctr: 5.68, cpc: 68.66, purchases: 39, revenue: 760000, roas: 5.1, cpa: 3820.51, messages: 103 },
      },
      campaigns: [
        {
          id: "demo-campaign-nomada",
          name: "Demo · La primera taza",
          status: "DEMO",
          objective: "OUTCOME_SALES",
          metrics30d: { spend: 149000, purchases: 39, revenue: 760000, roas: 5.1, cpa: 3820.51, ctr: 5.68, cpc: 68.66 },
          adsets: [
            { id: "demo-adset-manana", name: "Demo · Rutina de mañana", status: "DEMO", optimization: "OFFSITE_CONVERSIONS", spend: 92000, purchases: 27, revenue: 520000, roas: 5.65, cpa: 3407.41, ctr: 6.1, cpc: 63.2, messages: 71 },
            { id: "demo-adset-simple", name: "Demo · Sin tecnicismos", status: "DEMO", optimization: "OFFSITE_CONVERSIONS", spend: 57000, purchases: 12, revenue: 240000, roas: 4.21, cpa: 4750, ctr: 4.9, cpc: 76.8, messages: 32 },
          ],
        },
      ],
    },
  ],
};
