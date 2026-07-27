import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const schema = z.object({
  networkName: z.string().min(2).max(80),
  email:       z.string().email(),
  password:    z.string().min(8),
})

// Per-IP rate limiter: 5 attempts / 10 minutes (per serverless instance)
// Note: Vercel spawns multiple instances — configure Vercel's Edge middleware or WAF rules
// for a distributed limit in production.
const ipAttempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 10 * 60 * 1000  // 10 min
const MAX_ATTEMPTS = 5

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = ipAttempts.get(ip)
  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (entry.count >= MAX_ATTEMPTS) return false
  entry.count++
  return true
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Trop de tentatives, réessayez dans 10 minutes' }, { status: 429 })
  }

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { networkName, email, password } = body.data

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Create org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org, error: orgError } = await (supabaseAdmin as any)
    .from('organizations')
    .insert({ name: networkName, type: 'siege' })
    .select()
    .single()

  if (orgError) return NextResponse.json({ error: 'Erreur lors de la création du réseau' }, { status: 500 })

  // 2. Create user — trigger handle_new_user creates profile from user_metadata
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role:   'franchise_admin',
      org_id: org.id,
    },
  })

  if (userError) {
    // Cleanup orphaned org
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from('organizations').delete().eq('id', org.id)

    const isAlreadyRegistered = userError.message?.toLowerCase().includes('already registered')
      || userError.message?.toLowerCase().includes('already been registered')
    if (isAlreadyRegistered) {
      // Return same success shape as normal flow to avoid email enumeration
      return NextResponse.json({ ok: true }, { status: 201 })
    }
    console.error('[register-franchise] user creation error:', userError)
    return NextResponse.json({ error: 'Erreur lors de la création du compte' }, { status: 500 })
  }

  // 3. Ensure profile has correct role and org_id (fallback if trigger cast failed)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabaseAdmin as any)
    .from('profiles')
    .update({ role: 'franchise_admin', org_id: org.id })
    .eq('id', userData.user.id)

  return NextResponse.json({ ok: true }, { status: 201 })
}
