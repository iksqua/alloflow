// src/app/api/receipts/[orderId]/sms/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendBrevoSms } from '@/lib/brevo'
import { z } from 'zod'

// Strip spaces and dashes, then validate E.164 format
const smsSchema = z.object({
  phone: z.string()
    .transform(v => v.replace(/[\s\-]/g, ''))
    .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Format E.164 requis (+33612345678)'))
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orderId } = await params
  const body = await req.json()
  const parsed = smsSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Establishment not found' }, { status: 400 })

  const { data: order } = await supabase
    .from('orders')
    .select('status, total_ttc')
    .eq('id', orderId)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  if (order.status !== 'paid') return NextResponse.json({ error: 'order_not_paid' }, { status: 422 })
  if (order.total_ttc == null) return NextResponse.json({ error: 'order_total_missing' }, { status: 422 })

  const { data: estab } = await supabase
    .from('establishments')
    .select('name, brevo_sender_name')
    .eq('id', profile.establishment_id)
    .single()

  if (!estab) return NextResponse.json({ error: 'establishment_not_found' }, { status: 500 })

  if (!process.env.BREVO_API_KEY) {
    return NextResponse.json({ unavailable: true }, { status: 503 })
  }

  const content = `${estab.name} — Votre reçu : https://alloflow.fr/receipt/${orderId} — Total : ${order.total_ttc.toFixed(2).replace('.', ',')} €`
  const sender = estab.brevo_sender_name ?? 'Alloflow'

  try {
    await sendBrevoSms({ sender, recipient: parsed.data.phone, content })
    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[receipt/sms]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'send_failed' }, { status: 500 })
  }
}
