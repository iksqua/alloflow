// src/app/dashboard/crm/campagnes/nouvelle/_components/campaign-form.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { renderTemplate } from '@/lib/template'  // client-safe module (not brevo.ts which is server-only)

const SEGMENTS = [
  { value: 'vip',      label: '👑 VIP' },
  { value: 'fidele',   label: '⭐ Fidèle' },
  { value: 'nouveau',  label: '🆕 Nouveau' },
  { value: 'a_risque', label: '⚠️ À risque' },
  { value: 'perdu',    label: '💤 Perdu' },
]

const VARIABLE_TOKENS = ['{{prenom}}', '{{points}}', '{{tier}}', '{{etablissement}}']

interface Props {
  establishmentName: string
}

export function CampaignForm({ establishmentName }: Props) {
  const router = useRouter()
  const [name, setName]                     = useState('')
  const [channel, setChannel]               = useState<'sms' | 'email' | 'whatsapp'>('sms')
  const [selectedSegments, setSelectedSegs] = useState<string[]>([])
  const [message, setMessage]               = useState('')
  const [saving, setSaving]                 = useState(false)
  const [sending, setSending]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const [created, setCreated]               = useState<string | null>(null)

  function toggleSegment(seg: string) {
    setSelectedSegs(prev =>
      prev.includes(seg) ? prev.filter(s => s !== seg) : [...prev, seg]
    )
  }

  function insertToken(token: string) {
    setMessage(prev => prev + token)
  }

  const preview = renderTemplate(message, {
    prenom: 'Marie',
    points: 150,
    tier: 'Silver',
    etablissement: establishmentName,
  })

  async function save(sendNow: boolean) {
    if (!name.trim()) { setError('Nom de campagne requis'); return }
    if (!message.trim()) { setError('Message requis'); return }
    if (message.length > 160) { setError('Message trop long (max 160 caractères)'); return }

    setSaving(true); setError(null)

    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        channel,
        template_body: message,
        segment_filter: selectedSegments.length ? { segments: selectedSegments } : {},
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Erreur création')
      return
    }
    const campaign = await res.json() as { id: string }
    setCreated(campaign.id)

    if (sendNow) {
      setSending(true)
      const sendRes = await fetch(`/api/campaigns/${campaign.id}/send`, { method: 'POST' })
      setSending(false)
      if (!sendRes.ok) {
        const data = await sendRes.json() as { error?: string }
        setError(data.error ?? 'Erreur envoi')
        return
      }
      const result = await sendRes.json() as { sent: number; failed: number }
      alert(`Campagne envoyée ! ${result.sent} envoyés, ${result.failed} erreurs.`)
      router.push('/dashboard/crm/campagnes')
    } else {
      router.push('/dashboard/crm/campagnes')
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">
          Nom de la campagne
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Promo vendredi soir"
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
        />
      </div>

      {/* Channel */}
      <div>
        <div className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-2">Canal</div>
        <div className="flex gap-2">
          {(['sms', 'email', 'whatsapp'] as const).map(ch => (
            <button
              key={ch}
              type="button"
              onClick={() => setChannel(ch)}
              className={[
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                channel === ch ? 'text-white' : 'text-[var(--text2)] bg-[var(--surface2)] hover:bg-[var(--surface)]',
              ].join(' ')}
              style={channel === ch ? { background: 'var(--blue)' } : undefined}
            >
              {ch === 'sms' ? '📱 SMS' : ch === 'email' ? '✉️ Email' : '💬 WhatsApp'}
            </button>
          ))}
        </div>
        {channel !== 'sms' && (
          <p className="text-xs text-amber-400 mt-2">⚠️ Seul le SMS est disponible en v2.</p>
        )}
      </div>

      {/* Segment filter */}
      <div>
        <div className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-2">
          Segments ciblés <span className="text-[var(--text3)] font-normal normal-case">(vide = tous)</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {SEGMENTS.map(seg => (
            <button
              key={seg.value}
              type="button"
              onClick={() => toggleSegment(seg.value)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                selectedSegments.includes(seg.value)
                  ? 'text-white'
                  : 'text-[var(--text2)] bg-[var(--surface2)] hover:bg-[var(--surface)]',
              ].join(' ')}
              style={selectedSegments.includes(seg.value) ? { background: 'var(--blue)' } : undefined}
            >
              {seg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="msg" className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Message</label>
          <span className="text-xs text-[var(--text4)]">{message.length}/160</span>
        </div>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {VARIABLE_TOKENS.map(token => (
            <button
              key={token}
              type="button"
              onClick={() => insertToken(token)}
              className="px-2 py-1 rounded text-[11px] font-mono text-[var(--text2)] hover:text-[var(--text1)] transition-colors"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
            >
              {token}
            </button>
          ))}
        </div>
        <textarea
          id="msg"
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          maxLength={160}
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)] resize-none font-mono"
          placeholder="Bonjour {{prenom}} ! ..."
        />
        <p className="text-xs text-[var(--text3)] mt-1">
          Tout SMS inclut automatiquement &quot;Répondez STOP pour vous désabonner&quot;.
        </p>
      </div>

      {/* Preview */}
      {message && (
        <div className="rounded-[10px] p-4" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}>
          <div className="text-xs font-medium text-[#a78bfa] mb-2">Aperçu (avec Marie, 150 pts, Silver)</div>
          <p className="text-sm text-[var(--text2)]">{preview}</p>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => save(false)}
          disabled={saving || sending}
          className="px-5 py-2.5 rounded-lg text-sm font-medium text-[var(--text2)] disabled:opacity-50"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer'}
        </button>
        <button
          onClick={() => save(true)}
          disabled={saving || sending || channel !== 'sms'}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--blue)' }}
        >
          {sending ? 'Envoi en cours...' : 'Envoyer maintenant'}
        </button>
      </div>
      {created && !sending && (
        <p className="text-xs text-green-400">Campagne créée. ID: {created}</p>
      )}
    </div>
  )
}
