import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token_hash = searchParams.get('token_hash')
  const type       = searchParams.get('type') as 'invite' | 'recovery' | 'email' | null

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', req.url))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash, type })

  if (error) {
    return NextResponse.redirect(new URL('/login?error=invalid_link', req.url))
  }

  // Invite flow → user must set a password
  if (type === 'invite') {
    return NextResponse.redirect(new URL('/auth/set-password', req.url))
  }

  // Recovery flow → same
  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/auth/set-password', req.url))
  }

  return NextResponse.redirect(new URL('/dashboard/products', req.url))
}
