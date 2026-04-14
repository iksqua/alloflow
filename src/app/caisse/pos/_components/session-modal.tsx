'use client'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { CashSession } from '../types'

interface ZReportSummary {
  order_count: number
  refund_count: number
  total_ttc: number
  total_refunds: number
  net_ttc: number
  total_ht: number
  tax_5_5: number
  tax_10: number
  tax_20: number
  total_discounts: number
  by_method: Record<string, number>
}

const METHOD_LABELS: Record<string, string> = {
  card: 'Carte bancaire',
  cash: 'Espèces',
  ticket_resto: 'Ticket restaurant',
}

function ZReportPrint({ session, summary }: { session: CashSession; summary: ZReportSummary }) {
  return (
    <div className="hidden print:block" style={{ fontFamily: 'monospace', fontSize: '12px', maxWidth: '300px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>
        RAPPORT Z — CLÔTURE DE CAISSE
      </div>
      <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '8px' }}>
        {new Date(session.opened_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        {' → '}
        {session.closed_at ? new Date(session.closed_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'en cours'}
      </div>
      <hr style={{ margin: '8px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Nb ventes</span><span>{summary.order_count}</span></div>
      {summary.refund_count > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Remboursements</span><span>{summary.refund_count}</span></div>}
      <hr style={{ margin: '8px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Total brut TTC</span><span>{summary.total_ttc.toFixed(2)} €</span></div>
      {summary.total_refunds > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Remboursements</span><span>-{summary.total_refunds.toFixed(2)} €</span></div>}
      {summary.total_discounts > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Remises commerciales</span><span>-{summary.total_discounts.toFixed(2)} €</span></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}><span>NET TTC</span><span>{summary.net_ttc.toFixed(2)} €</span></div>
      <hr style={{ margin: '8px 0' }} />
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Ventilation TVA</div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>HT</span><span>{summary.total_ht.toFixed(2)} €</span></div>
      {summary.tax_5_5 > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TVA 5,5%</span><span>{summary.tax_5_5.toFixed(2)} €</span></div>}
      {summary.tax_10 > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TVA 10%</span><span>{summary.tax_10.toFixed(2)} €</span></div>}
      {summary.tax_20 > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>TVA 20%</span><span>{summary.tax_20.toFixed(2)} €</span></div>}
      <hr style={{ margin: '8px 0' }} />
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Modes de paiement</div>
      {Object.entries(summary.by_method).map(([method, amount]) => (
        <div key={method} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{METHOD_LABELS[method] ?? method}</span>
          <span>{amount.toFixed(2)} €</span>
        </div>
      ))}
      <hr style={{ margin: '8px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Fond ouverture</span><span>{(session.opening_float ?? 0).toFixed(2)} €</span></div>
      <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '10px', color: '#666' }}>
        Rapport généré le {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  )
}

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
  const [zReport, setZReport] = useState<{ session: CashSession; summary: ZReportSummary } | null>(null)
  const printRef = useRef(false)
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
      // Fetch Z-report data then print
      try {
        const zRes = await fetch('/api/receipts/z-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: session.id }),
        })
        if (zRes.ok) {
          const zData = await zRes.json()
          setZReport({ session: closedSession, summary: zData.summary })
          printRef.current = true
          // Give React time to render the print template
          setTimeout(() => { window.print(); printRef.current = false }, 300)
        } else {
          toast.warning('Rapport Z non généré — réessayez depuis les paramètres')
        }
      } catch {
        toast.warning('Rapport Z non généré — réessayez depuis les paramètres')
      }
    } catch {
      toast.error('Erreur clôture session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Z-report print template (hidden, only visible during print) */}
      {zReport && <ZReportPrint session={zReport.session} summary={zReport.summary} />}
      <div className="absolute inset-0 bg-black/80 print:hidden" onClick={onDismiss} />
      <div
        className="relative w-full max-w-sm mx-4 sm:mx-0 rounded-2xl p-6 shadow-2xl print:hidden"
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
