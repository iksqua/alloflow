'use client'
import { useState } from 'react'

interface Props {
  initialSenderName: string
  initialReviewUrl: string
  smsCredits: number
}

export function CrmSettingsForm({ initialSenderName, initialReviewUrl, smsCredits }: Props) {
  const [senderName, setSenderName] = useState(initialSenderName)
  const [reviewUrl, setReviewUrl]   = useState(initialReviewUrl)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [saved, setSaved]           = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)

    const res = await fetch('/api/settings/crm', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        brevo_sender_name: senderName || undefined,
        google_review_url: reviewUrl || '',
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Erreur')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-lg">
      <div
        className="p-4 rounded-[10px]"
        style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.15)' }}
      >
        <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">
          Crédits SMS restants
        </div>
        <div className="text-2xl font-bold text-[var(--text1)]">{smsCredits} SMS</div>
        <p className="text-xs text-[var(--text3)] mt-1">
          Contactez Alloflow pour recharger vos crédits.
        </p>
      </div>

      <div>
        <label htmlFor="sender" className="block text-sm font-medium text-[var(--text2)] mb-1.5">
          Nom expéditeur SMS <span className="text-[var(--text3)]">(max 11 caractères)</span>
        </label>
        <input
          id="sender"
          type="text"
          maxLength={11}
          value={senderName}
          onChange={e => setSenderName(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
          placeholder="MonCafe"
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
        />
        <p className="text-xs text-[var(--text3)] mt-1">
          Apparaît comme expéditeur sur le téléphone du client. Alphanumerique uniquement.
        </p>
      </div>

      <div>
        <label htmlFor="review-url" className="block text-sm font-medium text-[var(--text2)] mb-1.5">
          Lien avis Google
        </label>
        <input
          id="review-url"
          type="url"
          value={reviewUrl}
          onChange={e => setReviewUrl(e.target.value)}
          placeholder="https://g.page/r/VOTRE_PLACE_ID/review"
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] bg-[var(--surface2)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
        />
        <p className="text-xs text-[var(--text3)] mt-1">
          Depuis Google Business → Obtenir plus d&apos;avis → copier le lien.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {saved && <p className="text-sm text-green-400">Paramètres sauvegardés ✓</p>}

      <button
        type="submit"
        disabled={saving}
        className="self-start px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
        style={{ background: 'var(--blue)' }}
      >
        {saving ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </form>
  )
}
