import { NextRequest, NextResponse } from 'next/server'
import { db, initDb } from '@/lib/db'
import { normalize } from '@/lib/adapters'
import { ingestOrder } from '@/lib/orders'
import { enqueueCapi } from '@/lib/capi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Endpoint que o gateway chama:
 *   POST /api/webhooks/kirvano?id=<id-do-webhook>
 *
 * Responde 200 sempre que o payload for aceito, mesmo se o evento for ignorado
 * (senao o gateway fica reenviando pra sempre).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params
  const webhookId = req.nextUrl.searchParams.get('id')
  if (!webhookId) return NextResponse.json({ ok: false, error: 'id ausente' }, { status: 400 })

  await initDb()
  const hook = await db.execute({ sql: `SELECT * FROM webhooks WHERE id = ?`, args: [webhookId] })
  const h: any = hook.rows[0]
  if (!h || !h.enabled) return NextResponse.json({ ok: false, error: 'webhook invalido' }, { status: 404 })
  if (h.platform !== platform) return NextResponse.json({ ok: false, error: 'plataforma divergente' }, { status: 400 })

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'json invalido' }, { status: 400 })
  }

  // Alguns gateways mandam um segredo no corpo ou no header.
  if (!h.secret) return NextResponse.json({ ok: false, error: 'Configure o segredo do webhook' }, { status: 503 })
  if (h.secret) {
    const got = req.headers.get('x-secret') || req.headers.get('x-webhook-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || payload?.secret
    if (got !== h.secret) return NextResponse.json({ ok: false, error: 'segredo invalido' }, { status: 401 })
  }

  const order = normalize(platform, payload)
  if (!order) return NextResponse.json({ ok: true, ignored: true })

  const saleType = req.nextUrl.searchParams.get('saleType')
  if (saleType === 'affiliate' || saleType === 'co-producer') order.saleType = saleType
  if (req.nextUrl.searchParams.get('ignoreRecurrence') === 'true' && order.isRecurring) {
    return NextResponse.json({ ok: true, ignored: 'recorrencia' })
  }

  const result = await ingestOrder(h.dashboard_id, platform, order, payload)

  // Purchase server-side pros pixels do dashboard.
  const saved = await db.execute({ sql: `SELECT * FROM orders WHERE id = ?`, args: [result.orderId] })
  const persisted: any = saved.rows[0]
  const visits = persisted.visitor_id ? await db.execute({ sql: `SELECT * FROM visits WHERE dashboard_id = ? AND visitor_id = ? AND julianday(created_at) <= julianday(?) ORDER BY created_at DESC LIMIT 1`, args: [h.dashboard_id, persisted.visitor_id, persisted.created_at] }) : null
  const visit: any = visits?.rows[0]
  const pixels = await db.execute({
    sql: `SELECT * FROM pixels WHERE dashboard_id = ? AND enabled = 1`,
    args: [h.dashboard_id],
  })
  for (const p of pixels.rows as any[]) {
    if (order.status !== 'paid' || persisted.status !== 'paid') continue
    if (p.send_value_type === 'commission' && !persisted.financials_known) continue

    const valueCents =
      p.send_value_type === 'no_value' ? undefined : Number(p.send_value_type === 'gross' ? persisted.gross_cents : persisted.net_cents)

    await enqueueCapi(h.dashboard_id, String(p.id), {
      eventName: 'Purchase',
      eventId: `${h.dashboard_id}-${platform}-${order.externalId}`,
      eventTime: Math.floor(new Date(order.approvedAt || order.createdAt).getTime() / 1000),
      valueCents,
      currency: order.currency || 'BRL',
      email: persisted.customer_email,
      phone: persisted.customer_phone,
      firstName: persisted.customer_name?.split(' ')[0] ?? null,
      country: order.customerCountry,
      ip: persisted.customer_ip || visit?.ip,
      externalId: persisted.customer_email,
      fbp: visit?.fbp,
      fbc: visit?.fbc,
      userAgent: visit?.user_agent,
      sourceUrl: visit?.landing_url,
    })
  }

  return NextResponse.json({ ok: true, orderId: result.orderId, trafficSource: result.trafficSource })
}

/** GET so pra validacao de endpoint que alguns gateways fazem. */
export async function GET() {
  return NextResponse.json({ ok: true })
}
