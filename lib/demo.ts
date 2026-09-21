// Explicit preview fixture. Never persisted or sent to any integration.
export const demoSummary = {
  revenue: 179100, grossRevenue: 199000, spend: 80000, profit: 99100,
  roas: 2.23875, roi: 1.23875, margin: 99100 / 179100,
  pendingRevenue: 15920, averageTicket: 1791, cpa: 800, cpt: 741,
  approvalRate: .9, untrackedApproved: 4, hasSpendData: true, lastSync: null,
  ordersCount: { total: 108, approved: 100, pending: 8, refunded: 0, chargedback: 0, creditCardApproved: 36, creditCardTotal: 40 },
  byDay: [{ day: 'Exemplo A', revenue: 50000 }, { day: 'Exemplo B', revenue: 60000 }, { day: 'Exemplo C', revenue: 69100 }],
  byHour: [{ hour: '10h', revenue: 50000 }, { hour: '14h', revenue: 60000 }, { hour: '18h', revenue: 69100 }],
  byProduct: [{ name: 'Oferta de demonstração', revenue: 179100, sales: 100 }],
  bySource: [{ source: 'Meta Ads', revenue: 170000, orders: 96 }, { source: 'Não atribuída', revenue: 9100, orders: 12 }],
}
