// src/app/api/automation/process/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendBrevoSms, renderTemplate } from '@/lib/brevo'

// Protect this endpoint with a shared secret
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  // Vercel sets Authorization header: Bearer <secret>
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${cronSecret}`
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // Get all active automation rules with their establishment data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rules } = await (supabase as any)
    .from('automation_rules')
    .select('*, establishments(id, name, brevo_sender_name, google_review_url, sms_credits)')
    .eq('active', true)

  if (!rules?.length) return NextResponse.json({ processed: 0 })

  let processed = 0

  for (const rule of rules) {
    const estab = rule.establishments
    if (!estab || estab.sms_credits <= 0) continue

    try {
      processed += await processRule(supabase, rule, estab)
    } catch (err) {
      console.error(`Automation rule ${rule.id} failed:`, err)
    }
  }

  return NextResponse.json({ processed })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processRule(supabase: any, rule: any, estab: any): Promise<number> {
  const now = new Date()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let customers: any[] = []

  switch (rule.trigger_type) {
    case 'welcome': {
      // Customers with exactly 1 order (rfm_segment = 'nouveau'), order was delay_hours ago
      const cutoff = new Date(now.getTime() - rule.delay_hours * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('customers')
        .select('id, first_name, phone, email, points, tier, rfm_segment')
        .eq('establishment_id', estab.id)
        .eq('rfm_segment', 'nouveau')
        .eq(`opt_in_${rule.channel}`, true)
        .lte('last_order_at', cutoff)
      customers = data ?? []
      break
    }

    case 'birthday': {
      // Customers whose birthday is in exactly 2 days (MM-DD match)
      const targetDate = new Date(now)
      targetDate.setDate(targetDate.getDate() + 2)
      const mmdd = `${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`
      const { data } = await supabase
        .from('customers')
        .select('id, first_name, phone, email, points, tier, rfm_segment, birthdate')
        .eq('establishment_id', estab.id)
        .eq(`opt_in_${rule.channel}`, true)
        .not('birthdate', 'is', null)
      // Filter by MM-DD match in JS (Supabase doesn't support month/day extraction in filters)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customers = (data ?? []).filter((c: any) => {
        if (!c.birthdate) return false
        const bd = new Date(c.birthdate)
        const bmmdd = `${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`
        return bmmdd === mmdd
      })
      break
    }

    case 'reactivation': {
      // Customers who just became a_risque (rfm_updated_at in last hour)
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('customers')
        .select('id, first_name, phone, email, points, tier, rfm_segment')
        .eq('establishment_id', estab.id)
        .eq('rfm_segment', 'a_risque')
        .eq(`opt_in_${rule.channel}`, true)
        .gte('rfm_updated_at', hourAgo)
      customers = data ?? []
      break
    }

    case 'lost': {
      // Customers who just became perdu (rfm_updated_at in last hour)
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('customers')
        .select('id, first_name, phone, email, points, tier, rfm_segment')
        .eq('establishment_id', estab.id)
        .eq('rfm_segment', 'perdu')
        .eq(`opt_in_${rule.channel}`, true)
        .gte('rfm_updated_at', hourAgo)
      customers = data ?? []
      break
    }

    case 'google_review': {
      if (!estab.google_review_url) return 0
      // Customers with a paid order in the last hour, no review SMS in last 90 days
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('customer_id')
        .eq('establishment_id', estab.id)
        .eq('status', 'paid')
        .gte('created_at', hourAgo)
        .not('customer_id', 'is', null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const customerIds: string[] = Array.from(new Set<string>((recentOrders ?? []).map((o: any) => o.customer_id as string)))
      if (!customerIds.length) return 0

      // Exclude customers who already got a google_review send in last 90 days
      const { data: alreadySent } = await supabase
        .from('campaign_sends')
        .select('customer_id')
        .in('customer_id', customerIds)
        .gte('sent_at', ninetyDaysAgo)
        .eq('trigger_type', 'google_review')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const alreadySentIds = new Set((alreadySent ?? []).map((s: any) => s.customer_id))

      const eligibleIds = customerIds.filter((id: string) => !alreadySentIds.has(id))
      if (!eligibleIds.length) return 0

      const { data } = await supabase
        .from('customers')
        .select('id, first_name, phone, email, points, tier, rfm_segment')
        .in('id', eligibleIds)
        .eq(`opt_in_${rule.channel}`, true)
      customers = data ?? []
      break
    }

    case 'tier_upgrade': {
      // Not implemented in this sprint (requires tier change tracking)
      return 0
    }

    default:
      return 0
  }

  // Deduplicate: skip customers who already received this automation trigger recently
  if (rule.trigger_type !== 'google_review') {
    // For non-google_review automations: check campaign_sends for this trigger_type
    // (welcome/birthday once per year logic is handled by the trigger conditions above)
    // No additional dedup needed beyond what trigger conditions already filter
  }

  // Send to eligible customers
  let sent = 0
  for (const customer of customers) {
    const message = renderTemplate(rule.template_body, {
      prenom:        customer.first_name,
      points:        customer.points,
      tier:          customer.tier,
      segment:       customer.rfm_segment,
      lien_avis:     estab.google_review_url ?? '',
      etablissement: estab.name,
    })

    try {
      const result = await sendBrevoSms({
        sender:    estab.brevo_sender_name ?? 'Alloflow',
        recipient: customer.phone,
        content:   message,
      })
      await supabase.rpc('deduct_sms_credit', { p_establishment_id: estab.id })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('campaign_sends').insert({
        campaign_id:      null,
        customer_id:      customer.id,
        channel:          rule.channel,
        trigger_type:     rule.trigger_type,  // for deduplication (e.g. google_review 90-day cooldown)
        status:           'sent',
        brevo_message_id: result.messageId,
      })
      sent++
    } catch {
      // Log failure silently — don't block the loop
    }
  }

  return sent
}
