'use client'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { LocalTicket, CashSession, Order, PaymentMode } from '../types'

type TpeStep = 'idle' | 'waiting' | 'pin' | 'approved' | 'refused'

interface PaymentModalProps {
  ticket: LocalTicket
  session: CashSession | null
  cashierId: string
  isOffline: boolean
  onClose: () => void
  onSuccess: (order: Order) => void
}

function computeTotal(ticket: LocalTicket): number {
  let subtotalHt = 0
  let totalTax = 0
  for (const item of ticket.items) {
    const lineHt = item.unitPriceHt * item.quantity
    subtotalHt += lineHt
    totalTax += lineHt * (item.tvaRate / 100)
  }
  let discount = 0
  if (ticket.discount) {
    discount = ticket.discount.type === 'percent'
      ? subtotalHt * (ticket.discount.value / 100)
      : ticket.discount.value
  }
  const discountedHt = subtotalHt - discount
  const ratio = subtotalHt > 0 ? discountedHt / subtotalHt : 1
  return discountedHt + totalTax * ratio
}

export function PaymentModal({ ticket, session, cashierId, isOffline, onClose, onSuccess }: PaymentModalProps) {
  const total = computeTotal(ticket)
  const [mode, setMode] = useState<PaymentMode>(isOffline ? 'cash' : 'card')
  const [cashGiven, setCashGiven] = useState('')
  const [splitCard, setSplitCard] = useState('')
  const [isPaying, setIsPaying] = useState(false)
  const [tpeStep, setTpeStep] = useState<TpeStep>('idle')
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // If we go offline mid-payment, switch to cash
  useEffect(() => {
    if (isOffline && mode !== 'cash') setMode('cash')
  }, [isOffline, mode])

  // Cleanup timer on unmount
  useEffect(() => () => {
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current)
  }, [])

  const cashChange = mode === 'cash' && cashGiven
    ? parseFloat(cashGiven.replace(',', '.')) - total
    : 0

  async function handlePay() {
    setIsPaying(true)
    try {
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session?.id,
          table_id: ticket.tableId,
          items: ticket.items.map((i) => ({
            product_id: i.productId,
            product_name: i.productName,
            emoji: i.emoji,
            unit_price: i.unitPriceHt,
            tva_rate: i.tvaRate,
            quantity: i.quantity,
          })),
        }),
      })
      if (!orderRes.ok) throw new Error('Order creation failed')
      const { order } = await orderRes.json()

      if (ticket.discount) {
        await fetch(`/api/orders/${order.id}/discounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ticket.discount),
        })
      }

      let payBody: Record<string, unknown>
      if (mode === 'card') {
        payBody = { method: 'card', amount: total }
      } else if (mode === 'cash') {
        payBody = { method: 'cash', amount: total, cash_given: parseFloat(cashGiven.replace(',', '.')) }
      } else {
        const cardAmount = parseFloat(splitCard.replace(',', '.'))
        const cashAmount = total - cardAmount
        payBody = {
          method: 'split',
          amount: total,
          split_payments: [
            { method: 'card', amount: cardAmount },
            { method: 'cash', amount: cashAmount, cash_given: cashAmount },
          ],
        }
      }

      const payRes = await fetch(`/api/orders/${order.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payBody),
      })
      if (!payRes.ok) throw new Error('Payment failed')
      onSuccess({ ...order, total_ttc: total })
    } catch {
      toast.error('Erreur lors du paiement')
      setTpeStep('idle')
    } finally {
      setIsPaying(false)
    }
  }

  function startTpe() {
    setTpeStep('waiting')
    waitingTimerRef.current = setTimeout(() => setTpeStep('pin'), 1800)
  }

  function confirmPin() {
    setTpeStep('approved')
    // Slight delay so user sees the approved state before modal closes
    setTimeout(() => handlePay(), 800)
  }

  function simulateRefusal() {
    setTpeStep('refused')
  }

  function retryTpe() {
    setTpeStep('waiting')
    waitingTimerRef.current = setTimeout(() => setTpeStep('pin'), 1800)
  }

  function switchToCash() {
    setTpeStep('idle')
    setMode('cash')
  }

  const canPay =
    mode === 'card' ||
    (mode === 'cash' && parseFloat(cashGiven.replace(',', '.') || '0') >= total) ||
    (mode === 'split' && parseFloat(splitCard.replace(',', '.') || '0') > 0 && parseFloat(splitCard.replace(',', '.') || '0') < total)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={tpeStep === 'idle' ? onClose : undefined} />
      <div
        className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* TPE simulation overlay */}
        {tpeStep !== 'idle' && (
          <div className="absolute inset-0 z-10 rounded-2xl flex flex-col items-center justify-center p-6" style={{ background: 'var(--surface)' }}>
            {/* TPE terminal visual */}
            <div className={`w-28 h-40 rounded-2xl flex flex-col items-center justify-center gap-3 mb-5 border-2 ${
              tpeStep === 'approved' ? 'border-green-500/40 shadow-[0_0_28px_rgba(16,185,129,.2)]' :
              tpeStep === 'refused'  ? 'border-red-500/40 shadow-[0_0_28px_rgba(239,68,68,.2)]' :
              'border-blue-600/40 shadow-[0_0_28px_rgba(29,78,216,.15)]'
            }`} style={{ background: 'var(--surface2)' }}>
              <div className="w-20 h-12 rounded-md flex items-center justify-center text-xs border border-[var(--border)]" style={{ background: 'var(--bg)', color: 'var(--muted)' }}>
                {tpeStep === 'waiting'  && '...' }
                {tpeStep === 'pin'      && '****'}
                {tpeStep === 'approved' && '✓'  }
                {tpeStep === 'refused'  && '✗'  }
              </div>
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="w-4 h-4 rounded" style={{ background: 'var(--border)' }} />
                ))}
              </div>
            </div>

            {tpeStep === 'waiting' && (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-sm font-semibold text-[var(--text1)]">En attente du terminal</span>
                </div>
                <p className="text-xs text-[var(--text4)] text-center">Insérez ou approchez la carte</p>
              </>
            )}

            {tpeStep === 'pin' && (
              <>
                <p className="text-sm font-semibold text-[var(--text1)] mb-1">Saisie du code PIN</p>
                <div className="flex gap-2 my-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="w-3.5 h-3.5 rounded-full bg-blue-500" />
                  ))}
                </div>
                <p className="text-xs text-[var(--text4)] mb-4">Le client saisit son PIN sur le terminal</p>
                <button onClick={confirmPin}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white mb-2"
                  style={{ background: 'var(--green)' }}>
                  ✓ PIN confirmé
                </button>
                {process.env.NODE_ENV === 'development' && (
                  <button onClick={simulateRefusal}
                    className="w-full py-2 rounded-xl text-xs font-medium border"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted)', background: 'transparent' }}>
                    [DEV] Simuler un refus
                  </button>
                )}
              </>
            )}

            {tpeStep === 'approved' && (
              <>
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(16,185,129,.15)' }}>
                  <span className="text-2xl">✓</span>
                </div>
                <p className="text-base font-bold text-green-400 mb-1">Approuvé</p>
                <p className="text-xs text-[var(--text4)]">Finalisation en cours…</p>
              </>
            )}

            {tpeStep === 'refused' && (
              <>
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(239,68,68,.12)' }}>
                  <span className="text-2xl text-red-400">✗</span>
                </div>
                <p className="text-base font-bold text-red-400 mb-1">Paiement refusé</p>
                <p className="text-xs text-[var(--text4)] mb-4 text-center">Carte refusée ou fonds insuffisants</p>
                <button onClick={retryTpe}
                  className="w-full py-2.5 rounded-xl text-sm font-bold text-white mb-2"
                  style={{ background: 'var(--blue)' }}>
                  ↩ Réessayer par CB
                </button>
                <button onClick={switchToCash}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold border mb-2"
                  style={{ borderColor: 'var(--border)', color: 'var(--text2)', background: 'transparent' }}>
                  💶 Payer en espèces
                </button>
                <button onClick={onClose}
                  className="w-full py-2 rounded-xl text-xs text-[var(--text4)]">
                  Annuler la vente
                </button>
              </>
            )}
          </div>
        )}

        {/* Normal payment form (hidden when TPE overlay active) */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-[var(--text1)]">Encaissement</h2>
          <button onClick={onClose} className="text-[var(--text4)] hover:text-[var(--text2)] text-xl">×</button>
        </div>

        <div className="text-center mb-6">
          <div className="text-4xl font-bold text-[var(--text1)] tabular-nums">
            {total.toFixed(2).replace('.', ',')} €
          </div>
          <p className="text-sm text-[var(--text3)] mt-1">Total TTC à encaisser</p>
        </div>

        {isOffline && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(245,158,11,.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,.3)' }}>
            <span>⚡</span>
            <span>Mode hors ligne — paiement CB indisponible</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-6">
          {(['card', 'cash', 'split'] as PaymentMode[]).map((m) => {
            const disabled = isOffline && m !== 'cash'
            return (
              <button
                key={m}
                onClick={() => !disabled && setMode(m)}
                disabled={disabled}
                className={[
                  'flex flex-col items-center gap-2 py-4 rounded-xl border-2 text-sm font-semibold transition-all',
                  disabled ? 'opacity-30 cursor-not-allowed border-[var(--border)] text-[var(--text4)]' :
                  mode === m
                    ? 'border-[var(--blue)] bg-[var(--blue-light)] text-[var(--text1)]'
                    : 'border-[var(--border)] text-[var(--text3)] hover:border-[var(--border)]',
                ].join(' ')}
              >
                <span className="text-2xl">{m === 'card' ? '💳' : m === 'cash' ? '💶' : '⚡'}</span>
                <span>{m === 'card' ? 'CB' : m === 'cash' ? 'Espèces' : 'Split'}</span>
              </button>
            )
          })}
        </div>

        {mode === 'cash' && (
          <div className="mb-6">
            <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-2 block">
              Somme remise par le client
            </label>
            <input
              type="number"
              step="0.01"
              value={cashGiven}
              onChange={(e) => setCashGiven(e.target.value)}
              placeholder="Ex: 50,00"
              className="w-full h-12 px-4 rounded-xl text-lg text-center bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)]"
              autoFocus
            />
            {cashChange > 0 && (
              <div className="mt-3 text-center">
                <span className="text-2xl font-bold text-[var(--green)]">
                  Rendu : {cashChange.toFixed(2).replace('.', ',')} €
                </span>
              </div>
            )}
          </div>
        )}

        {mode === 'split' && (
          <div className="mb-6">
            <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-2 block">Montant CB</label>
            <input
              type="number"
              step="0.01"
              value={splitCard}
              onChange={(e) => setSplitCard(e.target.value)}
              placeholder="0,00"
              className="w-full h-12 px-4 rounded-xl text-lg text-center bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)]"
              autoFocus
            />
            {splitCard && parseFloat(splitCard.replace(',', '.')) < total && (
              <p className="mt-2 text-center text-sm text-[var(--text3)]">
                Espèces : {(total - parseFloat(splitCard.replace(',', '.'))).toFixed(2).replace('.', ',')} €
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-center text-[var(--text4)] mb-4">
          Ticket Restaurant — disponible prochainement
        </p>

        <button
          onClick={mode === 'card' ? startTpe : handlePay}
          disabled={!canPay || isPaying}
          className="w-full h-14 rounded-xl text-lg font-bold text-white transition-all disabled:opacity-40 hover:opacity-90"
          style={{ background: 'var(--green)' }}
        >
          {isPaying ? 'Traitement…' : mode === 'card' ? '💳 Lancer le terminal CB' : '✓ Valider le paiement'}
        </button>
      </div>
    </div>
  )
}
