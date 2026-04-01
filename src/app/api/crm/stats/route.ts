// src/app/api/crm/stats/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  const establishmentId = profile?.establishment_id
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // First day of current month
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  try {

  // Get customer IDs for this establishment (needed for loyalty_transactions join)
  const { data: customerRows } = await supabase
    .from('customers')
    .select('id')
    .eq('establishment_id', establishmentId)

  const customerIds = (customerRows ?? []).map((c) => c.id)

  const [totalRes, goldRes, silverRes, ptsRes, rewardsRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', establishmentId),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', establishmentId)
      .eq('tier', 'gold'),
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('establishment_id', establishmentId)
      .eq('tier', 'silver'),
    customerIds.length > 0
      ? supabase
          .from('loyalty_transactions')
          .select('points')
          .eq('type', 'earn')
          .gte('created_at', firstOfMonth)
          .in('customer_id', customerIds)
      : Promise.resolve({ data: [] as { points: number }[] }),
    customerIds.length > 0
      ? supabase
          .from('loyalty_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('type', 'redeem')
          .gte('created_at', firstOfMonth)
          .in('customer_id', customerIds)
      : Promise.resolve({ count: 0 }),
  ])

  const ptsDistributedThisMonth = ((ptsRes as { data: { points: number }[] | null }).data ?? []).reduce(
    (sum, t) => sum + (t.points ?? 0),
    0
  )

  return NextResponse.json({
    totalCustomers: totalRes.count ?? 0,
    goldCount: goldRes.count ?? 0,
    silverCount: silverRes.count ?? 0,
    ptsDistributedThisMonth,
    rewardsUsedThisMonth: (rewardsRes as { count?: number | null }).count ?? 0,
  })

  } catch (err) {
    console.error('[crm/stats] Unexpected error:', err)
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}
