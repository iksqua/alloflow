// src/app/dashboard/crm/analytics/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PersonaCharts } from './_components/persona-charts'

export default async function CrmAnalyticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  const { data } = await supabase
    .from('v_crm_persona')
    .select('*')
    .eq('establishment_id', profile.establishment_id)
    .single()

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Persona clients</h1>
        <p className="text-sm text-[var(--text3)]">Données calculées automatiquement depuis l&apos;historique des commandes.</p>
      </div>
      <PersonaCharts data={data ? { ...data, total: data.total ?? 0 } : { total: 0 }} />
    </div>
  )
}
