// src/app/api/loyalty/config/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('establishment_id').eq('id', userId).single()
  return data?.establishment_id ?? null
}

const DEFAULT_LEVELS = [
  { key: 'standard', name: 'Standard', min: 0,    max: 499,  description: '' },
  { key: 'silver',   name: 'Silver',   min: 500,  max: 1999, description: '' },
  { key: 'gold',     name: 'Gold',     min: 2000, max: null, description: '' },
]

const DEFAULT_CONFIG = {
  active:            true,
  ptsPerEuro:        1,
  signupBonus:       50,
  ptsValidityDays:   365,
  minRedemptionPts:  100,
  levels:            DEFAULT_LEVELS,
  rewards:           [] as Array<{
    id?: string
    name: string
    ptsRequired: number
    type: string
    value: number
    levelRequired: string
    active: boolean
  }>,
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // Fetch config (may not exist yet)
  const { data: config } = await supabase
    .from('loyalty_config')
    .select('*')
    .eq('establishment_id', establishmentId)
    .single()

  // Fetch rewards
  const { data: rewards } = await supabase
    .from('loyalty_rewards')
    .select('id, name, points_required, type, value, level_required, active')
    .eq('establishment_id', establishmentId)
    .order('points_required', { ascending: true })

  if (!config) {
    return NextResponse.json({
      ...DEFAULT_CONFIG,
      rewards: (rewards ?? []).map(r => ({
        id:            r.id,
        name:          r.name,
        ptsRequired:   r.points_required,
        type:          r.type,
        value:         Number(r.value),
        levelRequired: r.level_required ?? 'standard',
        active:        r.active,
      })),
    })
  }

  return NextResponse.json({
    active:           config.active,
    ptsPerEuro:       Number(config.pts_per_euro),
    signupBonus:      config.signup_bonus,
    ptsValidityDays:  config.pts_validity_days,
    minRedemptionPts: config.min_redemption_pts,
    levels:           config.levels ?? DEFAULT_LEVELS,
    rewards: (rewards ?? []).map(r => ({
      id:            r.id,
      name:          r.name,
      ptsRequired:   r.points_required,
      type:          r.type,
      value:         Number(r.value),
      levelRequired: r.level_required ?? 'standard',
      active:        r.active,
    })),
  })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()

  const { ptsPerEuro, signupBonus, ptsValidityDays, minRedemptionPts, active, levels, rewards } = body

  if (typeof ptsPerEuro !== 'number' || ptsPerEuro < 0)
    return NextResponse.json({ error: 'ptsPerEuro invalide' }, { status: 400 })
  if (typeof signupBonus !== 'number' || signupBonus < 0)
    return NextResponse.json({ error: 'signupBonus invalide' }, { status: 400 })
  if (!Array.isArray(levels) || levels.length === 0)
    return NextResponse.json({ error: 'levels invalide' }, { status: 400 })
  if (!Array.isArray(rewards))
    return NextResponse.json({ error: 'rewards invalide' }, { status: 400 })

  // Upsert loyalty_config
  const { error: configError } = await supabase
    .from('loyalty_config')
    .upsert({
      establishment_id:   establishmentId,
      active:             active ?? true,
      pts_per_euro:       ptsPerEuro,
      signup_bonus:       signupBonus,
      pts_validity_days:  ptsValidityDays ?? 365,
      min_redemption_pts: minRedemptionPts ?? 100,
      levels:             levels,
      updated_at:         new Date().toISOString(),
    }, { onConflict: 'establishment_id' })

  if (configError) return NextResponse.json({ error: configError.message }, { status: 500 })

  // Replace loyalty_rewards: delete all then insert new ones
  const { error: deleteError } = await supabase
    .from('loyalty_rewards')
    .delete()
    .eq('establishment_id', establishmentId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const rewardsList = rewards as Array<{
    name: string
    ptsRequired: number
    type: string
    value: number
    levelRequired: string
    active: boolean
  }>

  if (rewardsList.length > 0) {
    const { error: insertError } = await supabase
      .from('loyalty_rewards')
      .insert(rewardsList.map(r => ({
        establishment_id: establishmentId,
        name:             r.name,
        points_required:  r.ptsRequired,
        type:             r.type,
        value:            r.value,
        level_required:   r.levelRequired ?? 'standard',
        active:           r.active ?? true,
      })))

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
