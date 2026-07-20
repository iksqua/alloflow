// src/app/api/orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const { data, error } = await supabase
    .from('orders')
    .select('*, items:order_items(*), payments(*)')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
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
    .select('establishment_id, status, table_id')
    .eq('id', id)
    .single()

  if (!existingOrder) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (existingOrder.establishment_id !== profile.establishment_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (existingOrder.status === 'paid' || existingOrder.status === 'refunded') {
    return NextResponse.json({ error: 'order_already_closed' }, { status: 409 })
  }

  const body = await req.json()
  const { status, note } = body as { status?: string; note?: string }

  // Only 'paying'↔'open' and 'cancelled' transitions are allowed via PATCH.
  // 'paid' is set exclusively by /pay, 'refunded' exclusively by /refund,
  // so that NF525 journal entries and role checks are never bypassed.
  const PATCH_ALLOWED_STATUSES = ['open', 'paying', 'cancelled'] as const
  if (status !== undefined && !(PATCH_ALLOWED_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'invalid_status_transition' }, { status: 400 })
  }

  const allowedUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (status !== undefined) allowedUpdate.status = status
  if (note !== undefined) allowedUpdate.note = note

  const { data, error } = await supabase
    .from('orders')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(allowedUpdate as any)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Free the table when an order is cancelled (e.g. split payment abandoned mid-flow).
  // The /pay route handles the paid→free transition; this covers the cancel path.
  if (status === 'cancelled' && existingOrder.table_id) {
    await supabase
      .from('restaurant_tables')
      .update({ status: 'free', current_order_id: null })
      .eq('id', existingOrder.table_id)
      .eq('current_order_id', id)
      .eq('establishment_id', profile.establishment_id)
  }

  return NextResponse.json({ order: data })
}
