// src/app/api/sops/[id]/steps/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sopStepSchema } from '@/lib/validations/sop'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  // Verify SOP ownership before reading its steps
  const { data: sop } = await supabase.from('sops').select('id').eq('id', id).eq('establishment_id', profile.establishment_id).single()
  if (!sop) return NextResponse.json({ error: 'SOP not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('sop_steps')
    .select('*')
    .eq('sop_id', id)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ steps: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  // Verify SOP ownership before adding steps
  const { data: sop } = await supabase.from('sops').select('id').eq('id', id).eq('establishment_id', profile.establishment_id).single()
  if (!sop) return NextResponse.json({ error: 'SOP not found' }, { status: 404 })

  const body = await req.json()
  const result = sopStepSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('sop_steps')
    .insert({ sop_id: id, ...result.data })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
