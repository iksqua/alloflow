// src/app/api/campaigns/[id]/send/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { renderTemplate } from '@/lib/template'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // Load campaign
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: campaign } = await (supabase as any)
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
  if (campaign.status === 'sent') return NextResponse.json({ error: 'Campagne déjà envoyée' }, { status: 409 })
  if (campaign.channel !== 'sms') {
    return NextResponse.json({ error: 'Seul le canal SMS est supporté en v2' }, { status: 400 })
  }

  // Load establishment (for template vars + credit check)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estab } = await (supabase as any)
    .from('establishments')
    .select('name, brevo_sender_name, sms_credits')
    .eq('id', profile.establishment_id)
    .single()

  if (!estab) {
    return NextResponse.json({ error: 'Établissement introuvable' }, { status: 500 })
  }
  if (estab.sms_credits <= 0) {
    return NextResponse.json({ error: 'Crédits SMS épuisés' }, { status: 402 })
  }

  // Resolve audience
  const optInField = campaign.channel === 'sms' ? 'opt_in_sms' : campaign.channel === 'email' ? 'opt_in_email' : 'opt_in_whatsapp'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('customers')
    .select('id, first_name, phone, email, points, tier, rfm_segment, avg_basket')
    .eq('establishment_id', profile.establishment_id)
    .eq(optInField, true)

  const filter = campaign.segment_filter as { segments?: string[]; tags?: string[] }
  if (filter?.segments?.length) {
    query = query.in('rfm_segment', filter.segments)
  }
  if (filter?.tags?.length) {
    query = query.overlaps('tags', filter.tags)
  }

  const { data: customers } = await query
  if (!customers?.length) {
    return NextResponse.json({ sent: 0, failed: 0, message: 'Aucun client éligible' })
  }

  // Send to each customer
  let sent = 0, failed = 0
  for (const customer of customers as Array<Record<string, unknown>>) {
    const message = renderTemplate(campaign.template_body, {
      prenom:        customer.first_name as string,
      points:        customer.points as number,
      tier:          customer.tier as string,
      segment:       customer.rfm_segment as string,
      etablissement: estab.name as string,
    })

    // Direct Brevo call (server-side, bypass HTTP round-trip)
    try {
      const { sendBrevoSms } = await import('@/lib/brevo')
      const result = await sendBrevoSms({
        sender:    estab.brevo_sender_name ?? 'Alloflow',
        recipient: customer.phone as string,
        content:   message,
      })

      // Deduct credit atomically FIRST, then log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc('deduct_sms_credit', { p_establishment_id: profile.establishment_id })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('campaign_sends').insert({
        campaign_id:      id,
        customer_id:      customer.id,
        channel:          campaign.channel,
        status:           'sent',
        brevo_message_id: result.messageId,
      })
      sent++
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('campaign_sends').insert({
        campaign_id: id,
        customer_id: customer.id,
        channel:     campaign.channel,
        status:      'failed',
      })
      failed++
    }
  }

  // Update campaign status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('campaigns')
    .update({ status: 'sent', sent_at: new Date().toISOString(), sent_count: sent })
    .eq('id', id)

  return NextResponse.json({ sent, failed })
}
