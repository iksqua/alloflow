import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// In-memory rate limiter for POST /api/auth/register-franchise
// Resets on cold start — acceptable for MVP
const ipCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX    = 5
const RATE_LIMIT_WINDOW = 60_000

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Rate limit POST /api/auth/register-franchise
  if (request.method === 'POST' && pathname === '/api/auth/register-franchise') {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
    const now = Date.now()
    const record = ipCounts.get(ip)
    if (!record || now > record.resetAt) {
      ipCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    } else {
      record.count++
      if (record.count >= RATE_LIMIT_MAX) {
        return NextResponse.json(
          { error: 'Trop de tentatives. Réessayez dans une minute.' },
          { status: 429 }
        )
      }
    }
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protected routes → redirect to login if not authenticated
  if (!user && (pathname.startsWith('/dashboard') || pathname.startsWith('/caisse'))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Already connected → skip login page
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard/products', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
    '/api/auth/register-franchise',
  ],
}
