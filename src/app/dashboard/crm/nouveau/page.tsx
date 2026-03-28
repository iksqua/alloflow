// src/app/dashboard/crm/nouveau/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NewCustomerForm } from './_components/new-customer-form'

export default async function NewCustomerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/onboarding')

  return (
    <div className="p-6 max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Nouveau client</h1>
        <p className="text-sm text-[var(--text3)] mt-1">Ajouter un client manuellement au CRM</p>
      </div>
      <NewCustomerForm establishmentId={profile.establishment_id} />
    </div>
  )
}
