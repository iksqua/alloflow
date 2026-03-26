// src/app/api/cash-sessions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { closing_float } = body

  // Calculer les totaux de la session
  const { data: sessionPayments } = await supabase
    .from('payments')
    .select('method, amount, orders!inner(session_id)')
    .eq('orders.session_id', id)

  const totalCash = sessionPayments
    ?.filter((p) => p.method === 'cash')
    .reduce((sum, p) => sum + p.amount, 0) ?? 0

  const totalCard = sessionPayments
    ?.filter((p) => p.method === 'card')
    .reduce((sum, p) => sum + p.amount, 0) ?? 0

  const { data, error } = await supabase
    .from('cash_sessions')
    .update({
      status: 'closed',
      closed_by: user.id,
      closed_at: new Date().toISOString(),
      closing_float,
      total_cash: totalCash,
      total_card: totalCard,
      total_sales: totalCash + totalCard,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ session: data })
}
