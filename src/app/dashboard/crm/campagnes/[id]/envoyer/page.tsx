// src/app/dashboard/crm/campagnes/[id]/envoyer/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EnvoyerButton } from './_components/envoyer-button'

export default async function EnvoyerCampagnePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name, channel, template_body, segment_filter, status, sent_count')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!campaign || campaign.status === 'sent') redirect('/dashboard/crm/campagnes')

  return (
    <div className="max-w-lg mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Confirmer l&apos;envoi</h1>
        <p className="text-sm text-[var(--text3)] mt-1">Cette action est irréversible.</p>
      </div>
      <div className="rounded-[12px] p-5 mb-6" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        <div className="text-sm font-semibold text-[var(--text1)] mb-2">{campaign.name}</div>
        <div className="text-xs text-[var(--text3)] mb-3">Canal : {campaign.channel.toUpperCase()}</div>
        <div className="rounded-lg p-3 text-sm text-[var(--text2)] font-mono" style={{ background: 'var(--surface)' }}>
          {campaign.template_body}
        </div>
      </div>
      <div className="flex gap-3">
        <Link
          href="/dashboard/crm/campagnes"
          className="flex-1 py-2.5 rounded-lg text-sm font-medium text-center text-[var(--text2)]"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
        >
          Annuler
        </Link>
        <EnvoyerButton campaignId={id} />
      </div>
    </div>
  )
}
