'use client'
// src/app/dashboard/crm/[id]/_components/customer-notes.tsx
import { useState } from 'react'

interface Props {
  customerId: string
  initialNotes: string
}

export function CustomerNotes({ customerId, initialNotes }: Props) {
  const [notes, setNotes] = useState(initialNotes)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function handleSave() {
    setSaving(true)
    setToast(null)
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      if (!res.ok) throw new Error('Erreur lors de la sauvegarde')
      setToast({ type: 'success', message: 'Notes sauvegardées' })
    } catch {
      setToast({ type: 'error', message: 'Échec de la sauvegarde' })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 3000)
    }
  }

  return (
    <div className="rounded-[14px] p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <h2 className="text-[13px] font-semibold text-[var(--text1)] mb-4">Notes caissier</h2>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">
          Notes internes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Ajouter des notes sur ce client…"
          className="w-full rounded-lg px-3 py-2 text-sm text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[#8b5cf6] transition-colors resize-none border border-[var(--border)]"
          style={{ background: 'var(--surface2)' }}
        />
        <div className="flex items-center justify-between">
          {toast ? (
            <span
              className="text-xs"
              style={{ color: toast.type === 'success' ? '#4ade80' : '#f87171' }}
            >
              {toast.message}
            </span>
          ) : (
            <span />
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: '#8b5cf6' }}
          >
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  )
}
