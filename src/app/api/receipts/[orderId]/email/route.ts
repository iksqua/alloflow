// src/app/api/receipts/[orderId]/email/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const emailSchema = z.object({
  email: z.string().email(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await params
  const body = await req.json()
  const parsed = emailSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_email' }, { status: 400 })

  // Vérifier que la commande est payée
  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()

  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  if (order.status !== 'paid') return NextResponse.json({ error: 'order_not_paid' }, { status: 422 })

  // TODO V2 : intégration Resend ou Postmark
  // Pour V1, on simule le succès (front utilise window.print() + mailto: fallback)
  console.log(`[Reçu email] Commande ${orderId} → ${parsed.data.email}`)

  return NextResponse.json({ success: true, email: parsed.data.email })
}
