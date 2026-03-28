import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CrmSettingsForm } from './_components/crm-settings-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estab } = await (supabase as any)
    .from('establishments')
    .select('brevo_sender_name, google_review_url, sms_credits')
    .eq('id', profile.establishment_id)
    .single()

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h1 className="text-xl font-semibold text-[var(--text1)] mb-6">Paramètres</h1>

      <div
        className="rounded-[14px] overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <div
          className="px-5 py-3 border-b border-[var(--border)]"
          style={{ background: 'var(--surface2)' }}
        >
          <span
            className="text-sm font-medium px-3 py-1.5 rounded-lg text-white"
            style={{ background: 'var(--blue)' }}
          >
            📱 CRM & Communications
          </span>
        </div>

        <div className="p-5" style={{ background: 'var(--surface)' }}>
          <CrmSettingsForm
            initialSenderName={estab?.brevo_sender_name ?? ''}
            initialReviewUrl={estab?.google_review_url ?? ''}
            smsCredits={estab?.sms_credits ?? 0}
          />
        </div>
      </div>
    </div>
  )
}
