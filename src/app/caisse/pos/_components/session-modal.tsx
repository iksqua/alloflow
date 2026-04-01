'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { CashSession } from '../types'

function formatDuration(openedAt: string): string {
  const ms = Date.now() - new Date(openedAt).getTime()
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}min`
  return `${minutes} min`
}

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
  const [duration, setDuration] = useState(() => session ? formatDuration(session.opened_at) : '')
  const isManager = userRole !== 'caissier'
  const hasOpenSession = !!session

  useEffect(() => {
    if (!session) return
    setDuration(formatDuration(session.opened_at))
    const interval = setInterval(() => setDuration(formatDuration(session.opened_at)), 30000)
    return () => clearInterval(interval)
  }, [session])

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
      onClose(closedSession)
      // Rapport Z en best-effort — ne bloque pas la clôture
      fetch('/api/receipts/z-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id }),
      }).then(r => { if (!r.ok) toast.warning('Rapport Z non généré — réessayez depuis les paramètres') })
        .catch(() => toast.warning('Rapport Z non généré — réessayez depuis les paramètres'))
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
            {!isManager && (
              <div className="mb-5 p-3 rounded-lg text-sm text-[var(--text3)] border border-[var(--border)]" style={{ background: 'var(--surface2)' }}>
                Seul un administrateur peut ouvrir la session. Contactez votre responsable.
              </div>
            )}
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
              {isManager && (
                <button
                  onClick={handleOpen}
                  disabled={loading}
                  className="flex-1 h-10 rounded-lg text-sm font-semibold text-white disabled:opacity-50 hover:opacity-90"
                  style={{ background: 'var(--green)' }}
                >
                  {loading ? 'Ouverture…' : 'Ouvrir la session'}
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <h3 className="text-base font-semibold text-[var(--text1)] mb-1">Session en cours</h3>
            <p className="text-sm text-[var(--text3)] mb-1">
              Ouverte le {new Date(session.opened_at).toLocaleDateString('fr-FR', {
                day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            <p className="text-xs text-[var(--text4)] mb-5">
              Ouverte depuis {duration}
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
