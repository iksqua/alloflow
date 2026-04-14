// src/app/dashboard/crm/programme/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LoyaltyConfigForm } from './_components/loyalty-config-form'

const DEFAULT_LEVELS = [
  { key: 'standard', name: 'Standard', min: 0,    max: 499,  description: '' },
  { key: 'silver',   name: 'Silver',   min: 500,  max: 1999, description: '' },
  { key: 'gold',     name: 'Gold',     min: 2000, max: null, description: '' },
]

export default async function ProgrammePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/dashboard')

  const { data: config } = await supabase
    .from('loyalty_config')
    .select('*')
    .eq('establishment_id', profile.establishment_id)
    .single()

  const { data: rewardsRaw } = await supabase
    .from('loyalty_rewards')
    .select('id, name, points_required, type, value, active')
    .eq('establishment_id', profile.establishment_id)
    .order('points_required', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rewardsWithLevel = rewardsRaw as any[]

  const initialConfig = {
    active:           config?.active ?? true,
    ptsPerEuro:       config ? Number(config.pts_per_euro) : 1,
    signupBonus:      config?.signup_bonus ?? 50,
    ptsValidityDays:  config?.pts_validity_days ?? 365,
    minRedemptionPts: config?.min_redemption_pts ?? 100,
    levels:           (config?.levels as typeof DEFAULT_LEVELS) ?? DEFAULT_LEVELS,
    rewards: (rewardsWithLevel ?? []).map((r: any) => ({
      id:            r.id as string,
      name:          r.name as string,
      ptsRequired:   r.points_required as number,
      type:          r.type as string,
      value:         Number(r.value),
      levelRequired: (r.level_required as string) ?? 'standard',
      active:        r.active as boolean,
    })),
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[var(--text1)]">Programme de fidélité</h1>
        <p className="text-sm text-[var(--text3)] mt-1">Configurez les règles de points, niveaux et récompenses</p>
      </div>
      <LoyaltyConfigForm initialConfig={initialConfig} />
    </div>
  )
}
