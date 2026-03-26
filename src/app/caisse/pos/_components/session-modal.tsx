'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { CashSession } from '../types'

interface SessionModalProps {
  session: CashSession | null
  onOpen: (session: CashSession) => void
  onClose: (session: CashSession) => void
  onDismiss: () => void
  userRole: string
}

export function SessionModal({ session, onOpen, onClose, onDismiss, userRole }: SessionModalProps) {
  const [openingFloat, setOpeningFloat] = useState('')
  const [closingFloat, setClosingFloat] = useState('')
  const [loading, setLoading] = useState(false)
  const isManager = userRole !== 'caissier'
  const hasOpenSession = !!session

  const handleOpen = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/cash-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_float: parseFloat(openingFloat || '0') }),
      })
      if (!res.ok) throw new Error()
      const { session: newSession } = await res.json()
      toast.success('Session ouverte')
      onOpen(newSession)
    } catch {
      toast.error('Erreur ouverture session')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = async () => {
    if (!session) return
    setLoading(true)
    try {
      const res = await fetch(`/api/cash-sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closing_float: parseFloat(closingFloat || '0') }),
      })
      if (!res.ok) throw new Error()
      const { session: closedSession } = await res.json()
      toast.success('Session clôturée')
      // Déclencher impression rapport Z
      await fetch('/api/receipts/z-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      })
      window.print()
      onClose(closedSession)
    } catch {
      toast.error('Erreur clôture session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80" onClick={onDismiss} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {!hasOpenSession ? (
          <>
            <h3 className="text-base font-semibold text-[var(--text1)] mb-1">Ouvrir la caisse</h3>
            <p className="text-sm text-[var(--text3)] mb-5">
              Démarrez une nouvelle session de caisse pour commencer à encaisser.
            </p>
            {isManager && (
              <div className="mb-5">
                <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-2 block">
                  Fond de caisse initial (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={openingFloat}
                  onChange={(e) => setOpeningFloat(e.target.value)}
                  placeholder="0,00"
                  className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)]"
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={onDismiss}
                className="flex-1 h-10 rounded-lg text-sm border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
              >
                Annuler
              </button>
              <button
                onClick={handleOpen}
                disabled={loading}
                className="flex-1 h-10 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90"
                style={{ background: 'var(--green)' }}
              >
                {loading ? 'Ouverture…' : 'Ouvrir la session'}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-base font-semibold text-[var(--text1)] mb-1">Session en cours</h3>
            <p className="text-sm text-[var(--text3)] mb-5">
              Ouverte le {new Date(session.opened_at).toLocaleDateString('fr-FR', {
                day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            {isManager && (
              <>
                <div className="mb-5">
                  <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-2 block">
                    Fond de caisse de clôture (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={closingFloat}
                    onChange={(e) => setClosingFloat(e.target.value)}
                    placeholder="0,00"
                    className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)]"
                  />
                </div>
                <button
                  onClick={handleClose}
                  disabled={loading}
                  className="w-full h-10 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90 mb-3"
                  style={{ background: 'var(--amber)' }}
                >
                  {loading ? 'Clôture…' : 'Clôturer et imprimer le rapport Z'}
                </button>
              </>
            )}
            <button
              onClick={onDismiss}
              className="w-full h-10 rounded-lg text-sm border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
            >
              Fermer
            </button>
          </>
        )}
      </div>
    </div>
  )
}
