'use client'
import { useState } from 'react'

interface Props {
  initialReviewUrl: string
  smsCredits: number
}

export function CrmSettingsForm({ initialReviewUrl, smsCredits }: Props) {
  const [reviewUrl, setReviewUrl] = useState(initialReviewUrl)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [saved,     setSaved]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)

    try {
      const res = await fetch('/api/settings/crm', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ google_review_url: reviewUrl || '' }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? 'Erreur')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-lg">
      <div
        className="p-4 rounded-[10px]"
        style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.15)' }}
      >
        <div className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1">
          Crédits SMS restants
        </div>
        <div className="text-2xl font-bold text-[var(--text1)]">{smsCredits} SMS</div>
        <p className="text-xs mt-1" style={{ color: 'var(--text4)' }}>
          Contactez Alloflow pour recharger vos crédits.
        </p>
      </div>

      <div>
        <label
          htmlFor="review-url"
          className="block text-xs font-semibold uppercase tracking-wide mb-1.5"
          style={{ color: 'var(--text4)' }}
        >
          Lien avis Google
        </label>
        <input
          id="review-url"
          type="url"
          value={reviewUrl}
          onChange={e => setReviewUrl(e.target.value)}
          placeholder="https://g.page/r/VOTRE_PLACE_ID/review"
          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--blue)]"
          style={{
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            color: 'var(--text1)',
          }}
        />
        <p className="text-xs mt-1" style={{ color: 'var(--text4)' }}>
          Depuis Google Business → Obtenir plus d&apos;avis → copier le lien.
        </p>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
      {saved && <p className="text-sm" style={{ color: 'var(--green)' }}>Paramètres sauvegardés ✓</p>}

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
