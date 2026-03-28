import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingForm } from './_components/onboarding-form'

export default async function NouveauFranchisePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin') redirect('/dashboard')

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Onboarder un franchisé</h1>
        <p className="text-sm text-[var(--text4)] mt-0.5">
          Crée la société franchisée, son établissement, et envoie l'invitation au gérant.
        </p>
      </div>
      <OnboardingForm />
    </div>
  )
}
