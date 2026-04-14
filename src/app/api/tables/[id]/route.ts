// src/app/api/tables/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const { data, error } = await supabase
    .from('restaurant_tables')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
