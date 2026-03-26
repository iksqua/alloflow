// src/app/api/orders/[id]/pay/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const paySchema = z.object({
  method: z.enum(['card', 'cash', 'split']),
  amount: z.number().positive(),
  cash_given: z.number().optional(),    // pour espèces
  split_payments: z.array(z.object({   // pour split
    method: z.enum(['card', 'cash']),
    amount: z.number().positive(),
    cash_given: z.number().optional(),
  })).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = paySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('total_ttc, status, table_id')
    .eq('id', id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status !== 'open' && order.status !== 'paying') {
    return NextResponse.json({ error: 'order_already_closed' }, { status: 409 })
  }

  const { method, amount, cash_given, split_payments } = parsed.data

  // Vérifier que le montant couvre la commande
  const totalPaid = method === 'split'
    ? (split_payments ?? []).reduce((s, p) => s + p.amount, 0)
    : amount

  if (Math.abs(totalPaid - order.total_ttc) > 0.01) {
    return NextResponse.json({ error: 'payment_amount_mismatch', total_ttc: order.total_ttc }, { status: 400 })
  }

  // Marquer la commande payée
  await supabase
    .from('orders')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', id)

  // Enregistrer le(s) paiement(s)
  const paymentsToInsert = method === 'split' && split_payments
    ? split_payments.map((p) => ({
        order_id: id,
        method: p.method,
        amount: p.amount,
        cash_given: p.cash_given ?? null,
        change_due: p.cash_given != null ? p.cash_given - p.amount : null,
      }))
    : [{
        order_id: id,
        method,
        amount,
        cash_given: cash_given ?? null,
        change_due: cash_given != null ? cash_given - amount : null,
      }]

  const { data: payments } = await supabase
    .from('payments')
    .insert(paymentsToInsert)
    .select()

  // Libérer la table
  if (order.table_id) {
    await supabase
      .from('restaurant_tables')
      .update({ status: 'free', current_order_id: null })
      .eq('id', order.table_id)
  }

  return NextResponse.json({ success: true, payments })
}
