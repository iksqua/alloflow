import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CrmSettingsForm } from '../_components/crm-settings-form'

export default async function CrmSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  const { data: estab } = await supabase
    .from('establishments')
    .select('google_review_url, sms_credits')
    .eq('id', profile.establishment_id)
    .single()

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-[var(--text1)] mb-6">CRM & Communications</h1>
      <div
        className="rounded-[14px] p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <CrmSettingsForm
          initialReviewUrl={estab?.google_review_url ?? ''}
          smsCredits={estab?.sms_credits ?? 0}
        />
      </div>
    </div>
  )
}
