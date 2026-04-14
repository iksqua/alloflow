// src/app/dashboard/crm/campagnes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

interface Campaign {
  id: string
  name: string
  channel: string
  status: string
  sent_at: string | null
  sent_count: number
  delivered_count: number
  created_at: string
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Brouillon',  color: '#94a3b8' },
  scheduled: { label: 'Planifiée', color: '#60a5fa' },
  sent:      { label: 'Envoyée',   color: '#10b981' },
  active:    { label: 'Active',    color: '#a78bfa' },
  paused:    { label: 'Pausée',    color: '#f59e0b' },
}

const CHANNEL_ICONS: Record<string, string> = { sms: '📱', email: '✉️', whatsapp: '💬' }

export default async function CampagnesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) redirect('/dashboard')

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, channel, status, sent_at, sent_count, delivered_count, created_at')
    .eq('establishment_id', profile.establishment_id)
    .eq('type', 'manual')
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text1)]">Campagnes</h1>
          <p className="text-sm text-[var(--text3)]">Envois manuels vers vos segments clients</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/crm/campagnes/automations"
            className="px-3 py-2 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
            style={{ border: '1px solid var(--border)' }}
          >
            ⚙️ Automations
          </Link>
          <Link
            href="/dashboard/crm/campagnes/nouvelle"
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--blue)' }}
          >
            + Nouvelle campagne
          </Link>
        </div>
      </div>

      {(!campaigns || campaigns.length === 0) ? (
        <div className="text-center py-16 text-[var(--text3)]">
          <div className="text-4xl mb-3">📤</div>
          <p className="mb-4">Aucune campagne envoyée pour le moment.</p>
          <Link
            href="/dashboard/crm/campagnes/nouvelle"
            className="inline-block px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--blue)' }}
          >
            Créer votre première campagne
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(campaigns as Campaign[]).map(c => {
            const status = STATUS_LABELS[c.status] ?? { label: c.status, color: '#94a3b8' }
            return (
              <div
                key={c.id}
                className="rounded-[12px] p-4"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{CHANNEL_ICONS[c.channel] ?? '📨'}</span>
                      <span className="font-medium text-sm text-[var(--text1)] truncate">{c.name}</span>
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: `${status.color}20`, color: status.color }}
                      >
                        {status.label}
                      </span>
                    </div>
                    {c.status === 'sent' && (
                      <div className="text-xs text-[var(--text3)]">
                        {c.sent_count} envoyés · {c.delivered_count} livrés
                        {c.sent_at && ` · ${new Date(c.sent_at).toLocaleDateString('fr-FR')}`}
                      </div>
                    )}
                  </div>
                  {c.status === 'draft' && (
                    <a
                      href={`/dashboard/crm/campagnes/${c.id}/envoyer`}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white shrink-0"
                      style={{ background: 'var(--blue)' }}
                    >
                      Envoyer
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
