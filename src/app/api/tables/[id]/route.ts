// src/app/api/tables/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const patchTableSchema = z.object({
  name:   z.string().min(1).max(50).optional(),
  seats:  z.number().int().min(1).max(99).optional(),
  status: z.enum(['free', 'occupied', 'reserved']).optional(),
}).strict()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const body = await req.json()
  const parsed = patchTableSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { id } = await params

  const { data, error } = await supabase
    .from('restaurant_tables')
    .update(parsed.data)
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ table: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id, role').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  if (!['admin', 'super_admin'].includes(profile.role as string)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params

  // Guard: don't delete tables that have an active order
  const { data: table } = await supabase
    .from('restaurant_tables')
    .select('current_order_id, establishment_id')
    .eq('id', id)
    .single()

  if (!table) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (table.establishment_id !== profile.establishment_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (table.current_order_id) return NextResponse.json({ error: 'Table has an active order' }, { status: 409 })

  const { error } = await supabase.from('restaurant_tables').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
