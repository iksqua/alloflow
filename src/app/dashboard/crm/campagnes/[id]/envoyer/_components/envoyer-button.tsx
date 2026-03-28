// src/app/dashboard/crm/campagnes/[id]/envoyer/_components/envoyer-button.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function EnvoyerButton({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    setLoading(true); setError(null)
    const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      setError(data.error ?? 'Erreur lors de l\'envoi')
      return
    }
    const result = await res.json() as { sent: number; failed: number }
    alert(`Campagne envoyée ! ${result.sent} envoyés${result.failed ? `, ${result.failed} erreurs` : ''}.`)
    router.push('/dashboard/crm/campagnes')
  }

  return (
    <div className="flex-1 flex flex-col gap-2">
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={handleSend}
        disabled={loading}
        className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
        style={{ background: 'var(--blue)' }}
      >
        {loading ? 'Envoi en cours...' : 'Envoyer maintenant'}
      </button>
    </div>
  )
}
