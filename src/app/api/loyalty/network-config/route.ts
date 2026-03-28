// src/app/api/loyalty/network-config/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { z } from 'zod'

const DEFAULT_LEVELS = [
  { key: 'standard', name: 'Standard', min: 0,    max: 499  },
  { key: 'silver',   name: 'Silver',   min: 500,  max: 1999 },
  { key: 'gold',     name: 'Gold',     min: 2000, max: null },
]

const levelSchema = z.object({
  key:  z.enum(['standard', 'silver', 'gold']),  // must match DB CHECK constraint
  name: z.string(),
  min:  z.number().min(0),
  max:  z.number().nullable(),
})

const putSchema = z.object({
  active:            z.boolean().optional(),
  ptsPerEuro:        z.number().min(0).max(10),
  minRedemptionPts:  z.number().min(0),
  levels:            z.array(levelSchema).min(1).refine(
    levels => levels.every((l, i) => i === 0 || l.min > levels[i - 1].min),
    { message: 'Les seuils doivent être en ordre croissant de min' }
  ),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()

  if (!profile || profile.role !== 'franchise_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!profile.org_id) {
    return NextResponse.json({ error: 'org_id manquant' }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const orgId = profile.org_id

  // Fetch config and network customers in parallel
  const monthStartStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()

  const [
    { data: config },
    { data: networkCustomers },
  ] = await Promise.all([
    (supabaseAdmin as any)
      .from('network_loyalty_config')
      .select('active, pts_per_euro, min_redemption_pts, levels')
      .eq('org_id', orgId)
      .single(),
    (supabaseAdmin as any)
      .from('network_customers')
      .select('tier')
      .eq('org_id', orgId),
  ])

  // Sum points issued this month via loyalty_transactions scoped to this network
  const { data: networkCustomerIds } = await (supabaseAdmin as any)
    .from('network_customers')
    .select('id')
    .eq('org_id', orgId)

  let pointsIssuedMonth = 0
  if (networkCustomerIds && networkCustomerIds.length > 0) {
    const ncIds = (networkCustomerIds as Array<{ id: string }>).map(nc => nc.id)
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
        .gte('created_at', monthStartStr)
        .in('customer_id', customerIds)

      pointsIssuedMonth = (earnTx ?? []).reduce(
        (sum: number, t: { points: number }) => sum + (t.points ?? 0), 0
      )
    }
  }

  const nc = (networkCustomers ?? []) as Array<{ tier: string }>
  const goldCount             = nc.filter(c => c.tier === 'gold').length
  const silverCount           = nc.filter(c => c.tier === 'silver').length
  const networkCustomersCount = nc.length

  if (!config) {
    return NextResponse.json({
      active:               true,
      ptsPerEuro:           1,
      minRedemptionPts:     100,
      levels:               DEFAULT_LEVELS,
      networkCustomersCount,
      goldCount,
      silverCount,
      points_issued_month:  pointsIssuedMonth,
    })
  }

  return NextResponse.json({
    active:               config.active,
    ptsPerEuro:           Number(config.pts_per_euro),
    minRedemptionPts:     config.min_redemption_pts,
    levels:               config.levels ?? DEFAULT_LEVELS,
    networkCustomersCount,
    goldCount,
    silverCount,
    points_issued_month:  pointsIssuedMonth,
  })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()

  if (!profile || profile.role !== 'franchise_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!profile.org_id) {
    return NextResponse.json({ error: 'org_id manquant' }, { status: 400 })
  }

  const body = await req.json()
  const result = putSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
  }

  const supabaseAdmin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await (supabaseAdmin as any)
    .from('network_loyalty_config')
    .upsert({
      org_id:             profile.org_id,
      active:             result.data.active ?? true,
      pts_per_euro:       result.data.ptsPerEuro,
      min_redemption_pts: result.data.minRedemptionPts,
      levels:             result.data.levels,
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'org_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
