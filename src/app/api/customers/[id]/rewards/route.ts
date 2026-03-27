// src/app/api/customers/[id]/rewards/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch customer to get points and tier
  const { data: customer, error: cErr } = await supabase
    .from('customers')
    .select('points, tier')
    .eq('id', id)
    .single()
  if (cErr || !customer) return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // Return rewards the customer can afford
  const { data, error } = await supabase
    .from('loyalty_rewards')
    .select('id, name, points_required, discount_type, discount_value')
    .eq('establishment_id', profile.establishment_id)
    .lte('points_required', customer.points)
    .order('points_required')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rewards: data ?? [], customer_points: customer.points, customer_tier: customer.tier })
}
