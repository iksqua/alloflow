// src/app/api/webhooks/brevo/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface BrevoEvent {
  event: 'delivered' | 'soft_bounce' | 'hard_bounce' | 'unsubscribed' | 'clicked'
  'message-id'?: string
  email?: string
  phone?: string
  tag?: string
}

const EVENT_TO_STATUS: Record<string, string> = {
  delivered:    'delivered',
  soft_bounce:  'bounced',
  hard_bounce:  'bounced',
  unsubscribed: 'delivered',  // delivered but opted out
}

export async function POST(req: NextRequest) {
  const events: BrevoEvent[] = await req.json().catch(() => [])

  // Brevo may send array or single object
  const list = Array.isArray(events) ? events : [events as BrevoEvent]
  if (!list.length) return NextResponse.json({ ok: true })

  const supabase = await createClient()

  for (const event of list) {
    const messageId = event['message-id']
    if (!messageId) continue

    const newStatus = EVENT_TO_STATUS[event.event]
    if (!newStatus) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('campaign_sends')
      .update({ status: newStatus })
      .eq('brevo_message_id', messageId)

    // Handle unsubscribe — find customer by phone/email and flip opt-in off
    if (event.event === 'unsubscribed') {
      if (event.phone) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('customers')
          .update({ opt_in_sms: false })
          .eq('phone', event.phone)
      }
      if (event.email) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('customers')
          .update({ opt_in_email: false })
          .eq('email', event.email)
      }
    }

    // Update delivered_count on campaign
    if (newStatus === 'delivered') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: send } = await (supabase as any)
        .from('campaign_sends')
        .select('campaign_id')
        .eq('brevo_message_id', messageId)
        .single()

      if (send?.campaign_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc('increment_campaign_delivered', { p_campaign_id: send.campaign_id })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
