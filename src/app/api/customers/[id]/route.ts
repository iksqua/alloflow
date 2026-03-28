// src/app/api/customers/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('customers')
    .select('id, first_name, last_name, tier, points, phone, email, notes, created_at, gender, birthdate, opt_in_sms, opt_in_email, opt_in_whatsapp, opt_in_at, tags, rfm_segment, rfm_updated_at, last_order_at, order_count, avg_basket, network_customer_id')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Client non trouvé' }, { status: 404 })

  // Fetch network identity if linked
  let network: { id: string; total_points: number; tier: string } | null = null
  if (data.network_customer_id) {
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: nc } = await (supabaseAdmin as any)
      .from('network_customers')
      .select('id, total_points, tier')
      .eq('id', data.network_customer_id)
      .single()
    if (nc) network = { id: nc.id, total_points: nc.total_points, tier: nc.tier }
  }

  return NextResponse.json({ ...data, network })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json() as Record<string, unknown>

  // Build update object — only include fields present in body
  const allowed = ['notes', 'gender', 'birthdate', 'opt_in_sms', 'opt_in_email',
                   'opt_in_whatsapp', 'tags', 'rfm_segment'] as const
  const update: Record<string, unknown> = {}
  for (const field of allowed) {
    if (field in body) update[field] = body[field]
  }

  // Record consent timestamp when any opt-in is being set to true
  const setsOptIn = ['opt_in_sms', 'opt_in_email', 'opt_in_whatsapp']
    .some(f => update[f] === true)
  if (setsOptIn) update.opt_in_at = new Date().toISOString()

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('customers')
    .update(update)
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .select('id, notes, gender, birthdate, opt_in_sms, opt_in_email, opt_in_whatsapp, opt_in_at, tags, rfm_segment')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Mise à jour échouée' }, { status: 500 })
  return NextResponse.json(data)
}
