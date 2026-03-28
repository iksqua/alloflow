import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CaisseSettingsForm } from '../_components/caisse-settings-form'

export default async function CaissePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')
  if (!['admin', 'super_admin'].includes(profile.role as string)) redirect('/dashboard')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: estab } = await (supabase as any)
    .from('establishments')
    .select('default_opening_float, auto_print_receipt, receipt_footer, default_tva_rate')
    .eq('id', profile.establishment_id)
    .single()

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-[var(--text1)] mb-6">Configuration caisse</h1>
      <div
        className="rounded-[14px] p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <CaisseSettingsForm
          initialOpeningFloat={estab?.default_opening_float ?? 0}
          initialAutoPrint={estab?.auto_print_receipt ?? false}
          initialFooter={estab?.receipt_footer ?? ''}
          initialTvaRate={estab?.default_tva_rate ?? 10}
        />
      </div>
    </div>
  )
}
