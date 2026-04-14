import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AutomationRulesForm } from './_components/automation-rules-form'

export default async function AutomationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  const [rulesResult, estabResult] = await Promise.all([
    supabase.from('automation_rules').select('*').eq('establishment_id', profile.establishment_id),
    supabase.from('establishments').select('brevo_sender_name, google_review_url, sms_credits').eq('id', profile.establishment_id).single(),
  ])

  const rules = rulesResult.data ?? []
  const estab = estabResult.data

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-[var(--text1)] mb-2">Automations</h1>
      <p className="text-sm text-[var(--text3)] mb-6">
        Ces messages partent automatiquement quand la condition est déclenchée.
      </p>
      <AutomationRulesForm
        initialRules={rules}
        googleReviewUrl={estab?.google_review_url ?? null}
        senderName={estab?.brevo_sender_name ?? null}
        smsCredits={estab?.sms_credits ?? 0}
      />
    </div>
  )
}
