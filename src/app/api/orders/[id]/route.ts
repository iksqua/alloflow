// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*), payments(*)')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ order: data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const { id } = await params

  const { data: existingOrder } = await supabase
    .from('orders')
    .select('establishment_id, status')
    .eq('id', id)
    .single()

  if (!existingOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (existingOrder.establishment_id !== profile.establishment_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (existingOrder.status === 'paid') {
    return NextResponse.json({ error: 'order_already_paid' }, { status: 409 })
  }

  const body = await req.json()
  const { status, customer_note } = body as { status?: string; customer_note?: string }
  const allowedUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status !== undefined) allowedUpdate.status = status
  if (customer_note !== undefined) allowedUpdate.customer_note = customer_note

  const { data, error } = await supabase
    .from('orders')
    .update(allowedUpdate)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ order: data })
}
