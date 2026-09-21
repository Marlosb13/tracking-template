import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

// Protect the panel AND its APIs. Public ingestion never grants panel access.
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  if (path === '/t.js' || path === '/api/collect' || path === '/api/pixel-config' || path.startsWith('/api/webhooks/') || path.startsWith('/api/cron/')) return NextResponse.next()
  const password = process.env.PANEL_PASSWORD
  const username = process.env.PANEL_USER || 'admin'
  if (!password || password.length < 16) return new NextResponse('Configure PANEL_PASSWORD (mínimo 16 caracteres) nos secrets do servidor.', { status: 503 })
  let supplied = ''
  try {
    const header = req.headers.get('authorization') || ''
    if (header.startsWith('Basic ')) supplied = Buffer.from(header.slice(6), 'base64').toString('utf8')
  } catch {}
  const expected = Buffer.from(`${username}:${password}`)
  const actual = Buffer.from(supplied)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new NextResponse('Acesso restrito', { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Tracking", charset="UTF-8"', 'Cache-Control': 'no-store' } })
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.get('origin') !== req.nextUrl.origin) return new NextResponse('Origem não permitida', { status: 403 })
  const response = NextResponse.next()
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
