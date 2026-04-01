// src/app/api/receipts/[orderId]/sms/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const smsSchema = z.object({
  phone: z.string().min(10).max(20),
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
    .from('orders').select('status').eq('id', orderId).eq('establishment_id', profile.establishment_id).single()

  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  if (order.status !== 'paid') return NextResponse.json({ error: 'order_not_paid' }, { status: 422 })

  // Check if SMS sending is configured (Brevo / Twilio)
  const brevoKey = process.env.BREVO_API_KEY
  if (!brevoKey) {
    return NextResponse.json({ success: false, unavailable: true, reason: 'sms_not_configured' }, { status: 501 })
  }

  // TODO V2 : intégration Brevo transactional SMS
  console.info(`[Reçu SMS] Commande ${orderId} → ${parsed.data.phone}`)
  return NextResponse.json({ success: true, phone: parsed.data.phone })
}
