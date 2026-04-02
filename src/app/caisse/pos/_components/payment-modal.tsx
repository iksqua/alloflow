'use client'
// src/app/caisse/pos/_components/payment-modal.tsx
import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { PaymentSplit } from './payment-split'
import type { LocalTicket, CashSession, Order, LoyaltyCustomer, LoyaltyReward, SplitPerson } from '../types'

type ModalStep = 'method' | 'card' | 'cash' | 'mixed' | 'split-assign' | 'split-person' | 'confirm'

interface PaymentModalProps {
  ticket: LocalTicket
  session: CashSession | null
  // cashierId available but derived server-side from auth session
  cashierId: string
  isOffline: boolean
  linkedCustomer: LoyaltyCustomer | null
  linkedReward: LoyaltyReward | null
  onClose: () => void
  onSuccess: (order: Order) => void
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

function r2(x: number) { return Math.round(x * 100) / 100 }

export function computeTotalBeforeLoyalty(ticket: LocalTicket): number {
  let subtotalHt = 0
  let totalTax = 0
  for (const item of ticket.items) {
    const lineHt = r2(item.unitPriceHt * item.quantity)
    subtotalHt += lineHt
    totalTax += r2(lineHt * (item.tvaRate / 100))
  }
  subtotalHt = r2(subtotalHt)
  totalTax = r2(totalTax)
  let discount = 0
  if (ticket.discount) {
    discount = ticket.discount.type === 'percent'
      ? r2(subtotalHt * (ticket.discount.value / 100))
      : ticket.discount.value
  }
  const discountedHt = r2(subtotalHt - discount)
  const ratio = subtotalHt > 0 ? discountedHt / subtotalHt : 1
  return r2(discountedHt + totalTax * ratio)
}

export function computeTotal(ticket: LocalTicket, reward: LoyaltyReward | null): number {
  const base = computeTotalBeforeLoyalty(ticket)
  if (!reward) return base
  const loyaltyDiscount = (reward.type === 'percent' || reward.type === 'reduction_pct')
    ? r2(base * (reward.value / 100))
    : reward.value
  return r2(Math.max(0, base - loyaltyDiscount))
}

function loyaltyDiscountEur(ticket: LocalTicket, reward: LoyaltyReward | null): number {
  if (!reward) return 0
  const base = computeTotalBeforeLoyalty(ticket)
  return (reward.type === 'percent' || reward.type === 'reduction_pct')
    ? Math.round(base * (reward.value / 100) * 100) / 100
    : reward.value
}

// ─── Order creation helper ────────────────────────────────────────────────────

async function createOrder(
  ticket: LocalTicket,
  session: CashSession | null,
  linkedCustomer: LoyaltyCustomer | null,
  linkedReward: LoyaltyReward | null,
  loyaltyAmt: number,
): Promise<{ id: string; total_ttc: number }> {
  const orderRes = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id:             session?.id ?? undefined,
      table_id:               ticket.tableId ?? undefined,
      customer_id:            linkedCustomer?.id ?? undefined,
      reward_id:              linkedReward?.id ?? undefined,
      reward_discount_amount: loyaltyAmt > 0 ? loyaltyAmt : undefined,
      items: ticket.items.map(i => ({
        product_id:   i.productId,
        product_name: i.productName,
        emoji:        i.emoji,
        unit_price:   i.unitPriceHt,
        tva_rate:     i.tvaRate,
        quantity:     i.quantity,
      })),
    }),
  })
  if (!orderRes.ok) {
    const err = await orderRes.json().catch(() => ({}))
    throw new Error(`Erreur création commande (${orderRes.status}): ${JSON.stringify(err)}`)
  }
  const { order } = await orderRes.json()

  if (ticket.discount) {
    await fetch(`/api/orders/${order.id}/discounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ticket.discount),
    })
  }
  return order
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentModal({ ticket, session, cashierId, isOffline, linkedCustomer, linkedReward, onClose, onSuccess }: PaymentModalProps) {
  const total = computeTotal(ticket, linkedReward)
  const loyaltyAmt = loyaltyDiscountEur(ticket, linkedReward)

  // Always start at 'method' — offline mode disables Carte/Split visually in that step
  const [step, setStep] = useState<ModalStep>('method')

  // Cash state
  const [cashGiven, setCashGiven] = useState('')

  // Mixed state (espèces + CB)
  const [mixedCash, setMixedCash] = useState('')

  // Split state
  const [splitPersons, setSplitPersons]         = useState<SplitPerson[]>([])
  const [splitIndex, setSplitIndex]             = useState(0)
  const [splitCash, setSplitCash]                   = useState('')
  const [splitCashAmounts, setSplitCashAmounts]     = useState<number[]>([])  // cash_given per cash person
  const [splitMixedParts, setSplitMixedParts]       = useState<number[]>([])  // cash portion per mixed person
  const [splitOrderId, setSplitOrderId]         = useState<string | null>(null)
  const [splitOrderTotal, setSplitOrderTotal]   = useState(0)

  // Confirm state
  const [completedOrder, setCompletedOrder]   = useState<Order | null>(null)
  const [receiptChoice, setReceiptChoice]     = useState<'none' | 'email' | 'sms' | 'invoice'>('none')
  const [receiptContact, setReceiptContact]   = useState(linkedCustomer?.email ?? '')
  const [companyName, setCompanyName]         = useState('')
  const [companySiret, setCompanySiret]       = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)

  const cashChange = cashGiven ? parseFloat(cashGiven.replace(',', '.')) - total : 0
  const currentPerson = splitPersons[splitIndex]

  // ── Payment handlers ──────────────────────────────────────────────────────

  const handleCardConfirm = useCallback(async () => {
    setIsSubmitting(true)
    try {
      const order = await createOrder(ticket, session, linkedCustomer, linkedReward, loyaltyAmt)
      const payRes = await fetch(`/api/orders/${order.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'card', amount: order.total_ttc }),
      })
      if (!payRes.ok) throw new Error(`Erreur paiement CB (${payRes.status})`)
      setCompletedOrder({ ...order, items: [] } as unknown as Order)
      setStep('confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de paiement')
    } finally {
      setIsSubmitting(false)
    }
  }, [ticket, session, linkedCustomer, linkedReward, loyaltyAmt])

  const handleCashConfirm = useCallback(async () => {
    const given = parseFloat(cashGiven.replace(',', '.'))
    if (isNaN(given) || given < total - 0.01) {
      toast.error(`Montant insuffisant (minimum ${total.toFixed(2)} €)`)
      return
    }
    setIsSubmitting(true)
    try {
      const order = await createOrder(ticket, session, linkedCustomer, linkedReward, loyaltyAmt)
      const payRes = await fetch(`/api/orders/${order.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'cash', amount: order.total_ttc, cash_given: given }),
      })
      if (!payRes.ok) throw new Error(`Erreur paiement espèces (${payRes.status})`)
      setCompletedOrder({ ...order, items: [] } as unknown as Order)
      setStep('confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de paiement')
    } finally {
      setIsSubmitting(false)
    }
  }, [ticket, session, linkedCustomer, linkedReward, loyaltyAmt, cashGiven, total])

  const handleMixedConfirm = useCallback(async () => {
    const cashPart = parseFloat(mixedCash.replace(',', '.'))
    if (isNaN(cashPart) || cashPart <= 0 || cashPart >= total - 0.009) {
      toast.error('La part espèces doit être inférieure au total')
      return
    }
    const cardPart = Math.round((total - cashPart) * 100) / 100
    setIsSubmitting(true)
    try {
      const order = await createOrder(ticket, session, linkedCustomer, linkedReward, loyaltyAmt)
      const payRes = await fetch(`/api/orders/${order.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'split',
          amount: order.total_ttc,
          split_payments: [
            { method: 'cash', amount: cashPart, cash_given: cashPart },
            { method: 'card', amount: cardPart },
          ],
        }),
      })
      if (!payRes.ok) throw new Error(`Erreur paiement mixte (${payRes.status})`)
      setCompletedOrder({ ...order, items: [] } as unknown as Order)
      setStep('confirm')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de paiement')
    } finally {
      setIsSubmitting(false)
    }
  }, [mixedCash, total, ticket, session, linkedCustomer, linkedReward, loyaltyAmt])

  const handleSplitAssignConfirm = useCallback(async (persons: SplitPerson[]) => {
    setSplitPersons(persons)
    setSplitIndex(0)
    setSplitCash('')
    setSplitCashAmounts(new Array(persons.length).fill(0))
    setSplitMixedParts(new Array(persons.length).fill(0))
    // Create order before sequencing through persons
    setIsSubmitting(true)
    try {
      const order = await createOrder(ticket, session, linkedCustomer, linkedReward, loyaltyAmt)
      setSplitOrderId(order.id)
      setSplitOrderTotal(order.total_ttc)
      setCompletedOrder({ ...order, items: [] } as unknown as Order)
      setStep('split-person')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur création commande')
    } finally {
      setIsSubmitting(false)
    }
  }, [ticket, session, linkedCustomer, linkedReward, loyaltyAmt])

  const handleSplitPersonNext = useCallback(async (cashAmount?: number, mixedCashPart?: number) => {
    const updatedCashAmounts = [...splitCashAmounts]
    if (cashAmount !== undefined) updatedCashAmounts[splitIndex] = cashAmount
    setSplitCashAmounts(updatedCashAmounts)

    const updatedMixedParts = [...splitMixedParts]
    if (mixedCashPart !== undefined) updatedMixedParts[splitIndex] = mixedCashPart
    setSplitMixedParts(updatedMixedParts)

    const next = splitIndex + 1
    if (next < splitPersons.length) {
      setSplitIndex(next)
      setSplitCash('')
    } else {
      if (!splitOrderId) { toast.error('Erreur interne — réessayez'); return }
      setIsSubmitting(true)
      try {
        // Flatten all persons into individual payments (mixed = 2 entries)
        const splitPayments: Array<{ method: 'card' | 'cash'; amount: number; cash_given?: number }> = []
        for (let i = 0; i < splitPersons.length; i++) {
          const p = splitPersons[i]
          if (p.method === 'mixed') {
            const cashPart = updatedMixedParts[i]
            const cardPart = Math.round((p.amount - cashPart) * 100) / 100
            splitPayments.push({ method: 'cash', amount: cashPart, cash_given: cashPart })
            splitPayments.push({ method: 'card', amount: cardPart })
          } else if (p.method === 'cash') {
            splitPayments.push({ method: 'cash', amount: p.amount, cash_given: updatedCashAmounts[i] || p.amount })
          } else {
            splitPayments.push({ method: 'card', amount: p.amount })
          }
        }
        const payRes = await fetch(`/api/orders/${splitOrderId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: 'split',
            amount: splitOrderTotal || total,
            split_payments: splitPayments,
          }),
        })
        if (!payRes.ok) throw new Error(`Erreur enregistrement paiement (${payRes.status})`)
        setStep('confirm')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erreur — réessayez')
      } finally {
        setIsSubmitting(false)
      }
    }
  }, [splitIndex, splitPersons, splitOrderId, splitCashAmounts, splitMixedParts, splitOrderTotal, total])

  async function handleTerminate() {
    if (!completedOrder) { onClose(); return }

    // Send receipt (non-blocking)
    if (receiptChoice === 'email' && receiptContact) {
      fetch(`/api/receipts/${completedOrder.id}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: receiptContact }),
      }).then(r => r.ok ? toast.success('Reçu envoyé par email') : toast.error('Échec envoi email'))
        .catch(() => toast.error('Échec envoi email'))
    } else if (receiptChoice === 'sms' && receiptContact) {
      fetch(`/api/receipts/${completedOrder.id}/sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: receiptContact }),
      }).then(r => r.ok ? toast.success('Reçu envoyé par SMS') : toast.error('Échec envoi SMS'))
        .catch(() => toast.error('Échec envoi SMS'))
    } else if (receiptChoice === 'invoice' && companyName) {
      fetch(`/api/receipts/${completedOrder.id}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName, siret: companySiret || undefined }),
      }).then(async r => {
        if (r.ok) {
          const { pdf_url, invoice_number } = await r.json()
          window.open(pdf_url, '_blank')
          toast.success(`Facture ${invoice_number} générée`)
        } else {
          toast.error('Erreur génération facture')
        }
      }).catch(() => toast.error('Erreur génération facture'))
    }

    onSuccess(completedOrder)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={step === 'method' ? onClose : undefined} />
      <div
        data-testid="payment-modal"
        className="relative w-full max-w-md mx-4 sm:mx-0 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 flex-shrink-0">
          <h2 className="text-lg font-bold" style={{ color: 'var(--text1)' }}>
            {step === 'confirm' ? 'Paiement enregistré' : 'Encaissement'}
          </h2>
          {step === 'method' && (
            <button onClick={onClose} style={{ color: 'var(--text4)' }} className="text-xl hover:opacity-70">✕</button>
          )}
          {step === 'confirm' && (
            <button onClick={handleTerminate} style={{ color: 'var(--text4)' }} className="text-xl hover:opacity-70">✕</button>
          )}
          {step !== 'method' && step !== 'confirm' && (
            <button
              onClick={() => setStep('method')}
              className="text-sm"
              style={{ color: 'var(--text4)' }}
            >
              ← Retour
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-4">

          {/* ── Step 1: Method ── */}
          {step === 'method' && (
            <>
              <div className="text-center py-4">
                <div className="text-5xl font-black tabular-nums" style={{ color: 'var(--text1)' }}>
                  {total.toFixed(2).replace('.', ',')} €
                </div>
                <p className="text-sm mt-1" style={{ color: 'var(--text4)' }}>Total TTC à encaisser</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(['card', 'cash', 'mixed', 'split'] as const).map(m => {
                  const disabled = isOffline && m !== 'cash'
                  const labels = { card: 'Carte', cash: 'Espèces', mixed: 'Mixte', split: 'Multi-personnes' }
                  const icons  = { card: '💳', cash: '💵', mixed: '💳+💵', split: '👥' }
                  const descs  = { card: 'Paiement CB', cash: 'Paiement espèces', mixed: 'Espèces + CB', split: 'Diviser la note' }
                  const nextStep: Record<typeof m, ModalStep> = { card: 'card', cash: 'cash', mixed: 'mixed', split: 'split-assign' }
                  return (
                    <button
                      key={m}
                      onClick={() => { if (!disabled) { setMixedCash(''); setStep(nextStep[m]) } }}
                      disabled={disabled}
                      className="flex flex-col items-center gap-1 py-4 rounded-2xl border-2 font-semibold transition-all"
                      style={disabled
                        ? { opacity: 0.35, cursor: 'not-allowed', borderColor: 'var(--border)', color: 'var(--text4)' }
                        : { borderColor: 'var(--border)', color: 'var(--text2)' }}
                    >
                      <span className="text-2xl">{icons[m]}</span>
                      <span className="text-sm font-bold">{labels[m]}</span>
                      <span className="text-[11px]" style={{ color: 'var(--text4)' }}>
                        {disabled ? 'Hors ligne' : descs[m]}
                      </span>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Step 2a: Card ── */}
          {step === 'card' && (
            <>
              <div className="flex flex-col items-center py-10 gap-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text4)' }}>À encaisser</p>
                <div className="text-6xl font-black tabular-nums" style={{ color: 'var(--text1)', letterSpacing: '-2px' }}>
                  {total.toFixed(2).replace('.', ',')} €
                </div>
                <p className="text-sm" style={{ color: 'var(--text4)' }}>💳 Entrez le montant sur le TPE physique</p>
              </div>
              <button
                onClick={handleCardConfirm}
                disabled={isSubmitting}
                className="w-full py-5 rounded-xl text-base font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--green)' }}
              >
                {isSubmitting ? 'Enregistrement…' : '✓ Paiement reçu'}
              </button>
              <button onClick={() => setStep('method')} className="w-full py-2 text-sm" style={{ color: 'var(--text4)' }}>
                Annuler
              </button>
            </>
          )}

          {/* ── Step 2b: Cash ── */}
          {step === 'cash' && (
            <>
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                  <span className="text-sm" style={{ color: 'var(--text4)' }}>À encaisser</span>
                  <span className="text-xl font-bold" style={{ color: 'var(--text1)' }}>{total.toFixed(2).replace('.', ',')} €</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                  <span className="text-sm" style={{ color: 'var(--text4)' }}>Remis par le client</span>
                  <span className="text-xl font-bold" style={{ color: 'var(--text1)' }}>
                    {cashGiven ? `${parseFloat(cashGiven.replace(',', '.')).toFixed(2).replace('.', ',')} €` : '—'}
                  </span>
                </div>
                {cashChange > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text2)' }}>Rendu monnaie</span>
                    <span className="text-2xl font-black" style={{ color: '#f59e0b' }}>{cashChange.toFixed(2).replace('.', ',')} €</span>
                  </div>
                )}
              </div>
              {/* Keypad shortcuts */}
              <div className="grid grid-cols-4 gap-2">
                {[5, 10, 20, 50].map(n => (
                  <button
                    key={`+${n}`}
                    onClick={() => setCashGiven(prev => String((parseFloat(prev || '0') + n).toFixed(2)))}
                    className="py-2 rounded-xl text-sm font-bold transition-colors"
                    style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                  >
                    +{n}
                  </button>
                ))}
              </div>
              {/* Keypad */}
              <div className="grid grid-cols-3 gap-2">
                {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map(k => (
                  <button
                    key={k}
                    onClick={() => {
                      if (k === '⌫') { setCashGiven(prev => prev.slice(0, -1)); return }
                      if (k === '.') { setCashGiven(prev => prev.includes('.') ? prev : prev + '.'); return }
                      setCashGiven(prev => (prev === '0' ? k : prev + k))
                    }}
                    className="py-4 rounded-xl text-base font-bold transition-colors"
                    style={{ background: 'var(--surface2)', color: k === '⌫' ? '#f87171' : 'var(--text1)' }}
                  >
                    {k}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCashConfirm}
                disabled={isSubmitting || !cashGiven || parseFloat(cashGiven.replace(',', '.')) < total - 0.01}
                className="w-full py-5 rounded-xl text-base font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--green)' }}
              >
                {isSubmitting
                  ? 'Enregistrement…'
                  : cashChange > 0
                    ? `Confirmer — rendre ${cashChange.toFixed(2).replace('.', ',')} €`
                    : 'Confirmer le paiement'}
              </button>
            </>
          )}

          {/* ── Step 2c: Mixed (espèces + CB) ── */}
          {step === 'mixed' && (() => {
            const cashVal  = parseFloat(mixedCash.replace(',', '.'))
            const cashOk   = !isNaN(cashVal) && cashVal > 0 && cashVal < total - 0.009
            const cardPart = cashOk ? Math.round((total - cashVal) * 100) / 100 : null
            return (
              <>
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                    <span className="text-sm" style={{ color: 'var(--text4)' }}>Total à encaisser</span>
                    <span className="text-xl font-bold" style={{ color: 'var(--text1)' }}>{total.toFixed(2).replace('.', ',')} €</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                    <span className="text-sm" style={{ color: 'var(--text4)' }}>💵 Part espèces</span>
                    <span className="text-xl font-bold" style={{ color: 'var(--text1)' }}>
                      {mixedCash ? `${cashVal.toFixed(2).replace('.', ',')} €` : '—'}
                    </span>
                  </div>
                  {cardPart !== null && (
                    <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                      <span className="text-sm font-semibold" style={{ color: 'var(--text2)' }}>💳 Reste CB</span>
                      <span className="text-2xl font-black" style={{ color: '#60a5fa' }}>{cardPart.toFixed(2).replace('.', ',')} €</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 20, 50].map(n => (
                    <button
                      key={`+${n}`}
                      onClick={() => setMixedCash(prev => {
                        const next = parseFloat(prev || '0') + n
                        return next >= total ? prev : String(next.toFixed(2))
                      })}
                      className="py-2 rounded-xl text-sm font-bold transition-colors"
                      style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                    >
                      +{n}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map(k => (
                    <button
                      key={k}
                      onClick={() => {
                        if (k === '⌫') { setMixedCash(prev => prev.slice(0, -1)); return }
                        if (k === '.') { setMixedCash(prev => prev.includes('.') ? prev : prev + '.'); return }
                        setMixedCash(prev => (prev === '0' ? k : prev + k))
                      }}
                      className="py-4 rounded-xl text-base font-bold transition-colors"
                      style={{ background: 'var(--surface2)', color: k === '⌫' ? '#f87171' : 'var(--text1)' }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleMixedConfirm}
                  disabled={isSubmitting || !cashOk}
                  className="w-full py-5 rounded-xl text-base font-bold text-white disabled:opacity-40"
                  style={{ background: 'var(--green)' }}
                >
                  {isSubmitting
                    ? 'Enregistrement…'
                    : cashOk
                      ? `Confirmer — ${cashVal.toFixed(2).replace('.', ',')} € espèces + ${cardPart?.toFixed(2).replace('.', ',')} € CB`
                      : 'Entrez la part espèces'}
                </button>
              </>
            )
          })()}

          {/* ── Step 2e: Split assign (multi-personnes) ── */}
          {step === 'split-assign' && (
            <PaymentSplit
              items={ticket.items}
              discount={ticket.discount}
              loyaltyDiscount={loyaltyAmt}
              totalFinal={total}
              onConfirm={handleSplitAssignConfirm}
              onBack={() => setStep('method')}
            />
          )}

          {/* ── Step 2d: Split — per-person payment ── */}
          {step === 'split-person' && currentPerson && (
            <>
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'rgba(29,78,216,0.1)', color: '#93c5fd' }}>
                Personne {splitIndex + 1}/{splitPersons.length} — {currentPerson.label}
              </div>

              {currentPerson.method === 'card' && (
                <>
                  <div className="flex flex-col items-center py-8 gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text4)' }}>{currentPerson.label} — À encaisser</p>
                    <div className="text-5xl font-black tabular-nums" style={{ color: 'var(--text1)' }}>
                      {currentPerson.amount.toFixed(2).replace('.', ',')} €
                    </div>
                    <p className="text-sm" style={{ color: 'var(--text4)' }}>💳 Entrez le montant sur le TPE physique</p>
                  </div>
                  <button
                    onClick={() => handleSplitPersonNext()}
                    disabled={isSubmitting}
                    className="w-full py-5 rounded-xl text-base font-bold text-white disabled:opacity-40"
                    style={{ background: 'var(--green)' }}
                  >
                    {isSubmitting ? 'Enregistrement…' : splitIndex < splitPersons.length - 1 ? '✓ Paiement reçu — suivant →' : '✓ Paiement reçu — terminer'}
                  </button>
                </>
              )}

              {currentPerson.method === 'cash' && (
                <>
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                      <span className="text-sm" style={{ color: 'var(--text4)' }}>{currentPerson.label} — Part</span>
                      <span className="text-xl font-bold" style={{ color: 'var(--text1)' }}>{currentPerson.amount.toFixed(2).replace('.', ',')} €</span>
                    </div>
                    {splitCash && parseFloat(splitCash) - currentPerson.amount > 0 && (
                      <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                        <span className="text-sm" style={{ color: 'var(--text2)' }}>Rendu</span>
                        <span className="text-2xl font-black" style={{ color: '#f59e0b' }}>
                          {(parseFloat(splitCash) - currentPerson.amount).toFixed(2).replace('.', ',')} €
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[5, 10, 20, 50].map(n => (
                      <button
                        key={`+${n}`}
                        onClick={() => setSplitCash(prev => String((parseFloat(prev || '0') + n).toFixed(2)))}
                        className="py-2 rounded-xl text-sm font-bold"
                        style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map(k => (
                      <button
                        key={k}
                        onClick={() => {
                          if (k === '⌫') { setSplitCash(prev => prev.slice(0, -1)); return }
                          if (k === '.') { setSplitCash(prev => prev.includes('.') ? prev : prev + '.'); return }
                          setSplitCash(prev => (prev === '0' ? k : prev + k))
                        }}
                        className="py-4 rounded-xl text-base font-bold"
                        style={{ background: 'var(--surface2)', color: k === '⌫' ? '#f87171' : 'var(--text1)' }}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handleSplitPersonNext(parseFloat(splitCash))}
                    disabled={isSubmitting || !splitCash || parseFloat(splitCash) < currentPerson.amount - 0.01}
                    className="w-full py-5 rounded-xl text-base font-bold text-white disabled:opacity-40"
                    style={{ background: 'var(--green)' }}
                  >
                    {isSubmitting ? 'Enregistrement…' : splitIndex < splitPersons.length - 1 ? 'Confirmer — suivant →' : 'Confirmer — terminer'}
                  </button>
                </>
              )}

              {currentPerson.method === 'mixed' && (() => {
                const cashVal  = parseFloat(splitCash.replace(',', '.'))
                const cashOk   = !isNaN(cashVal) && cashVal > 0 && cashVal < currentPerson.amount - 0.009
                const cardPart = cashOk ? Math.round((currentPerson.amount - cashVal) * 100) / 100 : null
                return (
                  <>
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                        <span className="text-sm" style={{ color: 'var(--text4)' }}>{currentPerson.label} — Part totale</span>
                        <span className="text-xl font-bold" style={{ color: 'var(--text1)' }}>{currentPerson.amount.toFixed(2).replace('.', ',')} €</span>
                      </div>
                      <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                        <span className="text-sm" style={{ color: 'var(--text4)' }}>💵 Part espèces</span>
                        <span className="text-xl font-bold" style={{ color: 'var(--text1)' }}>
                          {splitCash ? `${cashVal.toFixed(2).replace('.', ',')} €` : '—'}
                        </span>
                      </div>
                      {cardPart !== null && (
                        <div className="flex justify-between items-center px-4 py-3 rounded-xl" style={{ background: 'var(--surface2)' }}>
                          <span className="text-sm font-semibold" style={{ color: 'var(--text2)' }}>💳 Reste CB</span>
                          <span className="text-2xl font-black" style={{ color: '#60a5fa' }}>{cardPart.toFixed(2).replace('.', ',')} €</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[5, 10, 20, 50].map(n => (
                        <button
                          key={`+${n}`}
                          onClick={() => setSplitCash(prev => {
                            const next = parseFloat(prev || '0') + n
                            return next >= currentPerson.amount ? prev : String(next.toFixed(2))
                          })}
                          className="py-2 rounded-xl text-sm font-bold"
                          style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
                        >
                          +{n}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {['7','8','9','4','5','6','1','2','3','.','0','⌫'].map(k => (
                        <button
                          key={k}
                          onClick={() => {
                            if (k === '⌫') { setSplitCash(prev => prev.slice(0, -1)); return }
                            if (k === '.') { setSplitCash(prev => prev.includes('.') ? prev : prev + '.'); return }
                            setSplitCash(prev => (prev === '0' ? k : prev + k))
                          }}
                          className="py-4 rounded-xl text-base font-bold"
                          style={{ background: 'var(--surface2)', color: k === '⌫' ? '#f87171' : 'var(--text1)' }}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => handleSplitPersonNext(undefined, cashVal)}
                      disabled={isSubmitting || !cashOk}
                      className="w-full py-5 rounded-xl text-base font-bold text-white disabled:opacity-40"
                      style={{ background: 'var(--green)' }}
                    >
                      {isSubmitting
                        ? 'Enregistrement…'
                        : cashOk
                          ? splitIndex < splitPersons.length - 1
                            ? `${cashVal.toFixed(2).replace('.', ',')} € espèces + ${cardPart?.toFixed(2).replace('.', ',')} € CB — suivant →`
                            : `${cashVal.toFixed(2).replace('.', ',')} € espèces + ${cardPart?.toFixed(2).replace('.', ',')} € CB — terminer`
                          : 'Entrez la part espèces'}
                    </button>
                  </>
                )
              })()}
            </>
          )}

          {/* ── Step 3: Confirm + receipt ── */}
          {step === 'confirm' && completedOrder && (
            <>
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: 'rgba(22,101,52,0.15)', border: '1px solid rgba(74,222,128,0.2)' }}>
                <span className="text-lg">✅</span>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#4ade80' }}>Paiement enregistré</p>
                  <p className="text-xs" style={{ color: 'var(--text4)' }}>{total.toFixed(2).replace('.', ',')} € TTC</p>
                </div>
              </div>

              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text4)' }}>Envoyer un reçu</p>

              {(['none', 'email', 'sms', 'invoice'] as const).map(choice => {
                const labels = { none: '🚫 Pas de reçu', email: '📧 Email', sms: '📱 SMS', invoice: '🧾 Facture pro' }
                const descs  = { none: 'Terminer sans envoyer', email: 'Reçu simple par email', sms: 'Lien vers le reçu par SMS', invoice: 'PDF avec SIRET et TVA détaillée' }
                return (
                  <button
                    key={choice}
                    onClick={() => setReceiptChoice(choice)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
                    style={receiptChoice === choice
                      ? { borderColor: 'var(--blue)', background: 'rgba(29,78,216,0.08)' }
                      : { borderColor: 'var(--border)', background: 'var(--surface2)' }}
                  >
                    <span className="text-lg">{labels[choice].split(' ')[0]}</span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text1)' }}>{labels[choice].slice(3)}</p>
                      <p className="text-xs" style={{ color: 'var(--text4)' }}>{descs[choice]}</p>
                    </div>
                    <div className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                      style={receiptChoice === choice ? { borderColor: 'var(--blue)', background: 'var(--blue)' } : { borderColor: 'var(--text4)' }}
                    />
                  </button>
                )
              })}

              {(receiptChoice === 'email' || receiptChoice === 'sms') && (
                <input
                  type={receiptChoice === 'email' ? 'email' : 'tel'}
                  value={receiptContact}
                  onChange={e => setReceiptContact(e.target.value)}
                  placeholder={receiptChoice === 'email' ? 'email@client.fr' : '+33 6 12 34 56 78'}
                  className="w-full px-4 py-3 rounded-xl text-sm"
                  style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)', outline: 'none' }}
                />
              )}

              {receiptChoice === 'invoice' && (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Nom de la société *"
                    className="w-full px-4 py-3 rounded-xl text-sm"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)', outline: 'none' }}
                  />
                  <input
                    type="text"
                    value={companySiret}
                    onChange={e => setCompanySiret(e.target.value)}
                    placeholder="SIRET (optionnel)"
                    className="w-full px-4 py-3 rounded-xl text-sm"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)', outline: 'none' }}
                  />
                </div>
              )}

              <button
                onClick={handleTerminate}
                className="w-full py-5 rounded-xl text-base font-bold text-white"
                style={{ background: 'var(--blue)' }}
              >
                ✓ Terminer &amp; nouvelle commande
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
