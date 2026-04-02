// src/app/api/communications/send/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { uuidStr } from '@/lib/validations/uuid'
import { createClient } from '@/lib/supabase/server'
import { sendBrevoSms } from '@/lib/brevo'

const sendSchema = z.object({
  customerId:   uuidStr,
  channel:      z.enum(['sms', 'whatsapp', 'email']),
  message:      z.string().min(1).max(160),
  campaignId:   uuidStr.optional(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = sendSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { customerId, channel, message, campaignId } = body.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: customer } = await (supabase as any)
    .from('customers')
    .select('id, first_name, phone, email, opt_in_sms, opt_in_email, opt_in_whatsapp')
    .eq('id', customerId)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!customer) return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })

  // Check opt-in for channel
  const optInField = `opt_in_${channel}` as 'opt_in_sms' | 'opt_in_email' | 'opt_in_whatsapp'
  if (!customer[optInField]) {
    return NextResponse.json({ error: `Client sans opt-in ${channel}` }, { status: 422 })
  }

  if (channel !== 'sms') {
    return NextResponse.json({ error: 'Seul le canal SMS est disponible en v2' }, { status: 422 })
  }

  if (!customer.phone) {
    return NextResponse.json({ error: 'Client sans numéro de téléphone' }, { status: 422 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: establishment } = await (supabase as any)
    .from('establishments')
    .select('sms_credits, brevo_sender_name')
    .eq('id', profile.establishment_id)
    .single()

  if (!establishment || establishment.sms_credits <= 0) {
    return NextResponse.json({ error: 'Crédits SMS épuisés — contactez Alloflow pour recharger' }, { status: 402 })
  }

  const sender = establishment.brevo_sender_name ?? 'Alloflow'

  // Deduct credit atomically BEFORE calling Brevo to prevent race conditions.
  // deduct_sms_credit raises an exception if credits = 0, so this is the authoritative check.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('deduct_sms_credit', { p_establishment_id: profile.establishment_id })
  } catch {
    return NextResponse.json({ error: 'Crédits SMS épuisés' }, { status: 402 })
  }

  let brevoMessageId: string | null = null
  try {
    const result = await sendBrevoSms({
      sender,
      recipient: customer.phone,
      content:   message,
    })
    brevoMessageId = result.messageId
  } catch (err) {
    // Credit already deducted — log failure
    const msg = err instanceof Error ? err.message : 'Erreur Brevo'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('campaign_sends').insert({
      campaign_id:      campaignId ?? null,
      customer_id:      customerId,
      channel,
      status:           'failed',
      brevo_message_id: null,
    })
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // Log the send
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('campaign_sends').insert({
    campaign_id:      campaignId ?? null,
    customer_id:      customerId,
    channel,
    status:           'sent',
    brevo_message_id: brevoMessageId,
  })

  return NextResponse.json({ ok: true, messageId: brevoMessageId })
}
