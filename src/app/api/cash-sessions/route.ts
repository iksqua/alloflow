// src/app/api/cash-sessions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const openSessionSchema = z.object({
  opening_float: z.number().min(0).default(0),
})

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('cash_sessions')
    .select('*')
    .eq('establishment_id', profile.establishment_id)
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data?.[0] ?? null })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id, role').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  if (!['admin', 'super_admin', 'franchise_admin'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Insufficient permissions — admin required' }, { status: 403 })
  }

  const parsed = openSessionSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  const { opening_float } = parsed.data

  // Guard against duplicate open sessions (race condition protection)
  const { data: existingSession } = await supabase
    .from('cash_sessions')
    .select('id')
    .eq('establishment_id', profile.establishment_id)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle()
  if (existingSession) {
    return NextResponse.json({ error: 'session_already_open', session_id: existingSession.id }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('cash_sessions')
    .insert({
      establishment_id: profile.establishment_id,
      opened_by: user.id,
      opening_float,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data }, { status: 201 })
}
