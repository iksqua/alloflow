import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET() {
  // 1. Auth + role check (anon client)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'franchise_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!profile.org_id) {
    return NextResponse.json({ error: 'org_id manquant sur le profil' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const orgId = profile.org_id

  // 2. All orgs in network (siege + franchisees)
  const { data: networkOrgs } = await supabaseAdmin
    .from('organizations')
    .select('id, type, name')
    .or(`id.eq.${orgId},parent_org_id.eq.${orgId}`)

  if (!networkOrgs || networkOrgs.length === 0) {
    return NextResponse.json({ network: { ca_yesterday: 0, ca_month: 0, ca_month_prev: 0 }, establishments: [] })
  }

  const orgIds = networkOrgs.map((o: { id: string }) => o.id)

  // 3. All establishments in network
  const { data: establishments } = await supabaseAdmin
    .from('establishments')
    .select('id, name, org_id')
    .in('org_id', orgIds)

  if (!establishments || establishments.length === 0) {
    return NextResponse.json({ network: { ca_yesterday: 0, ca_month: 0, ca_month_prev: 0 }, establishments: [] })
  }

  const estIds = establishments.map((e: { id: string }) => e.id)

  // 4. Franchise contracts (keyed by establishment_id)
  const { data: contracts } = await supabaseAdmin
    .from('franchise_contracts')
    .select('establishment_id, royalty_rate, marketing_rate')
    .eq('org_id', orgId)

  const contractMap = new Map(
    (contracts ?? []).map((c: { establishment_id: string; royalty_rate: number; marketing_rate: number }) => [
      c.establishment_id,
      { royalty_rate: c.royalty_rate, marketing_rate: c.marketing_rate },
    ])
  )

  // 5. Date ranges
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]                              // e.g. '2026-03-28'
  const yesterdayStr = new Date(now.getTime() - 864e5).toISOString().split('T')[0]
  const monthStartStr = `${todayStr.slice(0, 7)}-01`
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0)
  const prevMonthStartStr = prevMonthStart.toISOString().split('T')[0]
  const prevMonthEndStr   = prevMonthEnd.toISOString().split('T')[0]

  // 6. Orders queries (all at once, then group by establishment)
  const [{ data: ordersYest }, { data: ordersMonth }, { data: ordersPrevMonth }] = await Promise.all([
    supabaseAdmin
      .from('orders')
      .select('establishment_id, total_ttc')
      .in('establishment_id', estIds)
      .eq('status', 'paid')
      .gte('created_at', `${yesterdayStr}T00:00:00`)
      .lt('created_at',  `${todayStr}T00:00:00`),
    supabaseAdmin
      .from('orders')
      .select('establishment_id, total_ttc')
      .in('establishment_id', estIds)
      .eq('status', 'paid')
      .gte('created_at', `${monthStartStr}T00:00:00`),
    supabaseAdmin
      .from('orders')
      .select('establishment_id, total_ttc')
      .in('establishment_id', estIds)
      .eq('status', 'paid')
      .gte('created_at', `${prevMonthStartStr}T00:00:00`)
      .lte('created_at', `${prevMonthEndStr}T23:59:59`),
  ])

  function sumByEstablishment(orders: Array<{ establishment_id: string; total_ttc: number }> | null) {
    const map = new Map<string, number>()
    for (const o of orders ?? []) {
      map.set(o.establishment_id, (map.get(o.establishment_id) ?? 0) + (o.total_ttc ?? 0))
    }
    return map
  }

  const caYestMap  = sumByEstablishment(ordersYest)
  const caMonthMap = sumByEstablishment(ordersMonth)
  const caPrevMap  = sumByEstablishment(ordersPrevMonth)

  // 7. Alerts
  // 7a. session_fermee: no open cash session today
  const { data: openSessions } = await supabaseAdmin
    .from('cash_sessions')
    .select('establishment_id')
    .in('establishment_id', estIds)
    .eq('status', 'open')

  const openSessionEstIds = new Set((openSessions ?? []).map((s: { establishment_id: string }) => s.establishment_id))

  // 7b. stock_bas: any stock item with current_quantity <= 0
  // Uses (supabaseAdmin as any) because stock_items.current_quantity may not be in database.ts
  const { data: lowStockItems } = await (supabaseAdmin as any)
    .from('stock_items')
    .select('establishment_id')
    .in('establishment_id', estIds)
    .lte('current_quantity', 0)
    .not('current_quantity', 'is', null)

  const lowStockEstIds = new Set(
    (lowStockItems ?? []).map((s: { establishment_id: string }) => s.establishment_id)
  )

  // 8. Build per-establishment response
  const orgsMap = new Map(networkOrgs.map((o: { id: string; type: string; name: string }) => [o.id, o]))

  const estResults = establishments.map((est: { id: string; name: string; org_id: string }) => {
    const org      = orgsMap.get(est.org_id)
    const isFranchise = org?.type === 'franchise'
    const contract = contractMap.get(est.id)
    const caMonth  = caMonthMap.get(est.id) ?? 0
    const royaltyRate   = isFranchise ? (contract?.royalty_rate   ?? 0) : 0
    const marketingRate = isFranchise ? (contract?.marketing_rate ?? 0) : 0

    const alerts: string[] = []
    if (!openSessionEstIds.has(est.id)) alerts.push('session_fermee')
    if (lowStockEstIds.has(est.id))     alerts.push('stock_bas')

    return {
      id:               est.id,
      name:             est.name,
      type:             isFranchise ? 'franchise' : 'own' as 'franchise' | 'own',
      ca_yesterday:     caYestMap.get(est.id) ?? 0,
      ca_month:         caMonth,
      royalty_rate:     royaltyRate,
      marketing_rate:   marketingRate,
      royalty_amount:   Math.round(caMonth * royaltyRate) / 100,
      marketing_amount: Math.round(caMonth * marketingRate) / 100,
      alerts,
    }
  })

  const networkCaYest  = estResults.reduce((s: number, e: { ca_yesterday: number }) => s + e.ca_yesterday, 0)
  const networkCaMonth = estResults.reduce((s: number, e: { ca_month: number })     => s + e.ca_month, 0)
  const networkCaPrev  = Array.from(caPrevMap.values()).reduce((s, v) => s + v, 0)

  // 9. Loyalty network stats
  const { data: networkCustomersData } = await (supabaseAdmin as any)
    .from('network_customers')
    .select('id, tier')
    .eq('org_id', orgId)

  const nc = (networkCustomersData ?? []) as Array<{ id: string; tier: string }>
  let pointsIssuedMonth = 0

  if (nc.length > 0) {
    const ncIds = nc.map(n => n.id)
    const { data: linkedCustomers } = await (supabaseAdmin as any)
      .from('customers')
      .select('id')
      .in('network_customer_id', ncIds)

    if (linkedCustomers && linkedCustomers.length > 0) {
      const customerIds = (linkedCustomers as Array<{ id: string }>).map(c => c.id)
      const { data: earnTx } = await (supabaseAdmin as any)
        .from('loyalty_transactions')
        .select('points')
        .eq('type', 'earn')
        .gte('created_at', `${monthStartStr}T00:00:00`)
        .in('customer_id', customerIds)

      pointsIssuedMonth = (earnTx ?? []).reduce(
        (s: number, t: { points: number }) => s + (t.points ?? 0), 0
      )
    }
  }

  const loyalty = {
    total_network_customers: nc.length,
    gold_count:              nc.filter(c => c.tier === 'gold').length,
    silver_count:            nc.filter(c => c.tier === 'silver').length,
    points_issued_month:     pointsIssuedMonth,
  }

  return NextResponse.json({
    network: {
      ca_yesterday:  networkCaYest,
      ca_month:      networkCaMonth,
      ca_month_prev: networkCaPrev,
    },
    establishments: estResults,
    loyalty,
  })
}
