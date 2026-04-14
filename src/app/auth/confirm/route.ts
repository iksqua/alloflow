import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type') as 'invite' | 'recovery' | 'email' | null

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', req.url))
  }

  // Determine destination before verifyOtp so we can wire cookies to the response
  const isPasswordFlow = type === 'invite' || type === 'recovery'
  const setPasswordUrl = new URL('/auth/set-password', req.url)
  if (type) setPasswordUrl.searchParams.set('flow', type)
  const destination = isPasswordFlow
    ? setPasswordUrl
    : new URL('/dashboard/products', req.url)

  const response = NextResponse.redirect(destination)

  // Build the Supabase client so it writes session cookies directly onto `response`
  // rather than using cookies() from next/headers, which may not forward to NextResponse.redirect
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.verifyOtp({ token_hash, type })

  if (error) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', req.url))
  }

  return response
}
