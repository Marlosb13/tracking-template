import { NextRequest, NextResponse } from 'next/server'
import { db, initDb, newId, dashboardExists } from '@/lib/db'
import { enqueueCapi } from '@/lib/capi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

const EVENT_TO_CAPI: Record<string, 'PageView' | 'InitiateCheckout' | 'Lead' | 'AddToCart'> = {
  page_view: 'PageView',
  initiate_checkout: 'InitiateCheckout',
  lead: 'Lead',
  add_to_cart: 'AddToCart',
}

export async function POST(req: NextRequest) {
  const allowed = (process.env.TRACKING_ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean)
  if (!allowed.includes(req.headers.get('origin') || '')) return NextResponse.json({ ok: false, error: 'Origem não configurada' }, { status: 403, headers: CORS })
  let body: any
  try {
    const raw = await req.text()
    if (raw.length > 16000) return NextResponse.json({ ok: false }, { status: 413, headers: CORS })
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: CORS })
  }

  const dashboardId = String(body?.dashboardId || '')
  const type = String(body?.type || '')
  if (!dashboardId || !['page_view', 'initiate_checkout', 'lead', 'add_to_cart'].includes(type) || !body.eventId || !body.sessionId) return NextResponse.json({ ok: false }, { status: 400, headers: CORS })
  if (!(await dashboardExists(dashboardId))) return NextResponse.json({ ok: false }, { status: 404, headers: CORS })

  await initDb()

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    null
  const ua = req.headers.get('user-agent')
  const country = req.headers.get('x-vercel-ip-country') || req.headers.get('cf-ipcountry')

  const utms = body.utms || {}
  const clickIds = body.clickIds || {}

  // Uma visita por sessao: e ela que resgata a UTM quando o gateway nao repassa.
  if (type === 'page_view' && body.sessionId) {
    const existing = await db.execute({
      sql: `SELECT id FROM visits WHERE dashboard_id = ? AND session_id = ? LIMIT 1`,
      args: [dashboardId, String(body.sessionId)],
    })
    if (!existing.rows.length) {
      await db.execute({
        sql: `INSERT INTO visits (id, dashboard_id, visitor_id, session_id, landing_url, referrer,
                                  src, sck, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                                  fbclid, gclid, ttclid, fbp, fbc, ip, user_agent, country)
              VALUES (?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?)`,
        args: [
          newId(), dashboardId, String(body.visitorId || ''), String(body.sessionId),
          body.landing ?? body.url ?? null, body.referrer ?? null,
          utms.src ?? null, utms.sck ?? null, utms.utm_source ?? null, utms.utm_medium ?? null,
          utms.utm_campaign ?? null, utms.utm_content ?? null, utms.utm_term ?? null,
          clickIds.fbclid ?? null, clickIds.gclid ?? null, clickIds.ttclid ?? null,
          body.fbp ?? null, body.fbc ?? null, ip, ua, country,
        ],
      })
    }
  }

  await db.execute({
    sql: `INSERT INTO events (id, dashboard_id, visitor_id, session_id, type, url, event_id, payload)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [
      newId(), dashboardId, body.visitorId ?? null, body.sessionId ?? null, type,
      body.url ?? null, body.eventId ?? null, JSON.stringify({ ...body, ip, ua }).slice(0, 8000),
    ],
  })

  // Espelha o evento no server-side pros pixels que pedem esse evento.
  const capiName = EVENT_TO_CAPI[type]
  if (capiName && capiName !== 'PageView') {
    const flagColumn =
      capiName === 'InitiateCheckout' ? 'send_initiate_checkout' : capiName === 'Lead' ? 'send_lead' : 'send_add_to_cart'
    const pixels = await db.execute({
      sql: `SELECT id FROM pixels WHERE dashboard_id = ? AND enabled = 1 AND ${flagColumn} = 1`,
      args: [dashboardId],
    })
    for (const p of pixels.rows as any[]) {
      await enqueueCapi(dashboardId, String(p.id), {
        eventName: capiName,
        eventId: String(body.eventId || newId()),
        eventTime: Math.floor(Date.now() / 1000),
        sourceUrl: body.url ?? null,
        ip,
        userAgent: ua,
        fbp: body.fbp ?? null,
        fbc: body.fbc ?? null,
      })
    }
  }

  return NextResponse.json({ ok: true }, { headers: CORS })
}
