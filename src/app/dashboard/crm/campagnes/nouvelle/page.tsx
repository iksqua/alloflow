// src/app/dashboard/crm/campagnes/nouvelle/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CampaignForm } from './_components/campaign-form'

export default async function NouvelleCampagnePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  const { data: estab } = await supabase
    .from('establishments')
    .select('name, sms_credits')
    .eq('id', profile.establishment_id)
    .single()

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Nouvelle campagne</h1>
        <p className="text-sm text-[var(--text3)]">
          Crédits disponibles : <span className="text-[var(--text1)] font-medium">{estab?.sms_credits ?? 0} SMS</span>
        </p>
      </div>
      <CampaignForm establishmentName={estab?.name ?? 'Alloflow'} />
    </div>
  )
}
