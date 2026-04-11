// src/app/api/automation/process/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendBrevoSms, renderTemplate } from '@/lib/brevo'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Protect this endpoint with a shared secret
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  // Vercel sets Authorization header: Bearer <secret>
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${cronSecret}`
}

type AutomationRuleRow = Database['public']['Tables']['automation_rules']['Row']
type EstablishmentRow  = Database['public']['Tables']['establishments']['Row']

type RuleWithEstab = AutomationRuleRow & {
  establishments: Pick<EstablishmentRow, 'id' | 'name' | 'brevo_sender_name' | 'google_review_url' | 'sms_credits'> | null
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // Get all active automation rules with their establishment data
  const { data: rules } = await supabase
    .from('automation_rules')
    .select('*, establishments(id, name, brevo_sender_name, google_review_url, sms_credits)')
    .eq('active', true)

  if (!rules?.length) return NextResponse.json({ processed: 0 })

  let processed = 0

  for (const rule of rules as RuleWithEstab[]) {
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

async function processRule(
  supabase: SupabaseClient<Database>,
  rule: AutomationRuleRow,
  estab: Pick<EstablishmentRow, 'id' | 'name' | 'brevo_sender_name' | 'google_review_url' | 'sms_credits'>
): Promise<number> {
  const now = new Date()
  type CustomerRow = { id: string; first_name: string; phone: string | null; email: string | null; points: number; tier: string; rfm_segment: string; birthdate?: string | null }
  let customers: CustomerRow[] = []

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
      customers = (data ?? []) as CustomerRow[]
      // Dedup: skip customers who already received welcome automation
      if (customers.length > 0) {
        const { data: alreadySent } = await supabase
          .from('campaign_sends')
          .select('customer_id')
          .in('customer_id', customers.map(c => c.id))
          .eq('trigger_type', 'welcome')
        const alreadySentIds = new Set((alreadySent ?? []).map(s => s.customer_id))
        customers = customers.filter(c => !alreadySentIds.has(c.id))
      }
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
      customers = ((data ?? []) as CustomerRow[]).filter(c => {
        if (!c.birthdate) return false
        const bd = new Date(c.birthdate)
        const bmmdd = `${String(bd.getMonth() + 1).padStart(2, '0')}-${String(bd.getDate()).padStart(2, '0')}`
        return bmmdd === mmdd
      })
      // Dedup: skip customers who already received birthday automation this year
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString()
      if (customers.length > 0) {
        const { data: alreadySent } = await supabase
          .from('campaign_sends')
          .select('customer_id')
          .in('customer_id', customers.map(c => c.id))
          .eq('trigger_type', 'birthday')
          .gte('sent_at', yearStart)
        const alreadySentIds = new Set((alreadySent ?? []).map(s => s.customer_id))
        customers = customers.filter(c => !alreadySentIds.has(c.id))
      }
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
      customers = (data ?? []) as CustomerRow[]
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
      customers = (data ?? []) as CustomerRow[]
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
      const customerIds: string[] = Array.from(new Set<string>((recentOrders ?? []).map(o => o.customer_id as string)))
      if (!customerIds.length) return 0

      // Exclude customers who already got a google_review send in last 90 days
      const { data: alreadySent } = await supabase
        .from('campaign_sends')
        .select('customer_id')
        .in('customer_id', customerIds)
        .gte('sent_at', ninetyDaysAgo)
        .eq('trigger_type', 'google_review')
      const alreadySentIds = new Set((alreadySent ?? []).map(s => s.customer_id))

      const eligibleIds = customerIds.filter(id => !alreadySentIds.has(id))
      if (!eligibleIds.length) return 0

      const { data } = await supabase
        .from('customers')
        .select('id, first_name, phone, email, points, tier, rfm_segment')
        .in('id', eligibleIds)
        .eq(`opt_in_${rule.channel}`, true)
      customers = (data ?? []) as CustomerRow[]
      break
    }

    case 'tier_upgrade': {
      // Not implemented in this sprint (requires tier change tracking)
      return 0
    }

    default:
      return 0
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

    // Deduct credit BEFORE sending — consistent with campaigns/[id]/send pattern.
    // If deduction fails (credits exhausted), stop processing this rule.
    const { error: deductError } = await supabase.rpc('deduct_sms_credit', { p_establishment_id: estab.id })
    if (deductError) break

    try {
      const result = await sendBrevoSms({
        sender:    estab.brevo_sender_name ?? 'Alloflow',
        recipient: customer.phone ?? '',
        content:   message,
      })
      await supabase.from('campaign_sends').insert({
        campaign_id:      null,
        customer_id:      customer.id,
        channel:          rule.channel,
        trigger_type:     rule.trigger_type,  // for deduplication (e.g. google_review 90-day cooldown)
        status:           'sent',
        brevo_message_id: result.messageId,
      })
      sent++
    } catch {
      // Send failed — refund the credit we already deducted
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)('refund_sms_credit', { p_establishment_id: estab.id }).catch(() => {
        console.error('[automation] Failed to refund SMS credit after send failure')
      })
      // Log failure — don't block the loop
      try {
        await supabase.from('campaign_sends').insert({
          campaign_id:  null,
          customer_id:  customer.id,
          channel:      rule.channel,
          trigger_type: rule.trigger_type,
          status:       'failed',
        })
      } catch {
        // Ignore logging errors
      }
    }
  }

  return sent
}
