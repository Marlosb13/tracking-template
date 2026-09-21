import { NormalizedOrder, OrderStatus, extractUtms, pick, toCents, toIso } from './base'

const EVENT_STATUS: Record<string, OrderStatus> = {
  'pix.paid': 'paid', 'card.paid': 'paid',
  'pix.generated': 'waiting_payment', 'card.generated': 'waiting_payment', 'card.pending': 'waiting_payment',
  'pix.expired': 'refused', 'card.expired': 'refused', 'pix.failed': 'refused', 'card.failed': 'refused',
  'pix.refunded': 'refunded', 'card.refunded': 'refunded',
  'pix.charged_back': 'chargedback', 'card.charged_back': 'chargedback',
}

/** Normaliza o payload documentado do ggCheckout. */
export function normalizeGgCheckout(payload: any): NormalizedOrder | null {
  const event = String(payload?.event || '').toLowerCase()
  const payment = payload?.payment ?? {}
  const status = EVENT_STATUS[event] || ({ paid: 'paid', pending: 'waiting_payment', refunded: 'refunded', charged_back: 'chargedback', failed: 'refused' } as Record<string, OrderStatus>)[String(payment.status || '').toLowerCase()]
  const externalId = pick(payment, ['id']) || pick(payload, ['orderId', 'order_id', 'id'])
  if (!externalId || !status) return null

  const { utms, clickIds, visitorId } = extractUtms(payload)
  const grossCents = toCents(payment.amount)
  const products: any[] = Array.isArray(payload?.products) ? payload.products : []
  const bumps = products.filter(p => ['orderbump', 'upsell', 'downsell'].includes(String(p?.type || '').toLowerCase()))
  const bumpCents = bumps.reduce((sum, p) => sum + (Number.isInteger(p?.price) ? Number(p.price) : toCents(p?.price)), 0)
  const main = payload?.product ?? products.find(p => String(p?.type || '').toLowerCase() === 'main')
  const items = [
    ...(main ? [{ productId: main.id ?? null, productName: main.title ?? main.name ?? 'Produto principal', quantity: 1, priceCents: Math.max(0, grossCents - bumpCents), isBump: false }] : []),
    ...bumps.map(p => ({ productId: p.id ?? null, productName: p.title ?? p.name ?? 'Order bump', quantity: 1, priceCents: Number.isInteger(p?.price) ? Number(p.price) : toCents(p?.price), isBump: true })),
  ]

  const method = String(payment.paymentMethod || '').toLowerCase()
  return {
    externalId: String(externalId), status,
    paymentMethod: method.includes('pix') ? 'pix' : method.includes('card') || method.includes('cart') ? 'credit_card' : method || null,
    installments: Number(payment.installments) || null,
    isRecurring: false, saleType: 'producer',
    customerName: payload?.customer?.name ?? null, customerEmail: payload?.customer?.email ?? null,
    customerPhone: payload?.customer?.phone ?? null, customerDoc: payload?.customer?.document ?? null,
    customerCountry: payload?.customer?.country ?? 'BR', customerIp: payload?.customer?.ip || payload?.customerIp || null,
    currency: 'BRL', grossCents, netCents: 0, grossKnown: payment.amount != null, financialsKnown: false,
    utms, clickIds, visitorId,
    createdAt: toIso(payload?.createdAt), approvedAt: status === 'paid' ? toIso(payload?.createdAt) : null,
    refundedAt: status === 'refunded' || status === 'chargedback' ? toIso(payload?.createdAt) : null,
    items: items.length ? items : [{ productId: main?.id ?? null, productName: main?.title ?? 'Sem nome', quantity: 1, priceCents: grossCents }],
  }
}
