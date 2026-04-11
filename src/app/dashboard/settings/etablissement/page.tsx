import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EstablishmentForm } from '../_components/establishment-form'

export default async function EtablissementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')
  if (!['admin', 'super_admin'].includes(profile.role as string)) redirect('/dashboard')

  const { data: estab } = await supabase
    .from('establishments')
    .select('name, siret, address, timezone, receipt_footer, brevo_sender_name')
    .eq('id', profile.establishment_id)
    .single()

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold text-[var(--text1)] mb-6">Établissement</h1>
      <div
        className="rounded-[14px] p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <EstablishmentForm
          initialName={estab?.name ?? ''}
          initialSiret={estab?.siret ?? ''}
          initialAddress={estab?.address ?? ''}
          initialTimezone={estab?.timezone ?? 'Europe/Paris'}
          initialReceiptFooter={estab?.receipt_footer ?? ''}
          initialBrevoSenderName={estab?.brevo_sender_name ?? ''}
        />
      </div>
    </div>
  )
}
