import { NextRequest, NextResponse } from 'next/server'

// In-memory rate limiter: max 5 POST requests per IP per minute
// Resets on cold start — acceptable for MVP
const ipCounts = new Map<string, { count: number; resetAt: number }>()

const RATE_LIMIT_MAX    = 5
const RATE_LIMIT_WINDOW = 60_000 // 1 minute in ms

export function middleware(req: NextRequest) {
  if (req.method === 'POST' && req.nextUrl.pathname === '/api/auth/register-franchise') {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
    const now = Date.now()

    const record = ipCounts.get(ip)
    if (!record || now > record.resetAt) {
      ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    } else {
      record.count++
      if (record.count > RATE_LIMIT_MAX) {
        return NextResponse.json(
          { error: 'Trop de tentatives. Réessayez dans une minute.' },
          { status: 429 }
        )
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/auth/register-franchise'],
}
