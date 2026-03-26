'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { LocalTicket, CashSession, Order, PaymentMode } from '../types'

interface PaymentModalProps {
  ticket: LocalTicket
  session: CashSession | null
  cashierId: string
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

export function PaymentModal({ ticket, session, cashierId, onClose, onSuccess }: PaymentModalProps) {
  const total = computeTotal(ticket)
  const [mode, setMode] = useState<PaymentMode>('card')
  const [cashGiven, setCashGiven] = useState('')
  const [splitCard, setSplitCard] = useState('')
  const [isPaying, setIsPaying] = useState(false)

  const cashChange = mode === 'cash' && cashGiven
    ? parseFloat(cashGiven.replace(',', '.')) - total
    : 0

  const handlePay = async () => {
    setIsPaying(true)
    try {
      // 1. Créer la commande
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

      // 2. Appliquer remise si besoin
      if (ticket.discount) {
        await fetch(`/api/orders/${order.id}/discounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ticket.discount),
        })
      }

      // 3. Payer
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
    } catch (e) {
      toast.error('Erreur lors du paiement')
    } finally {
      setIsPaying(false)
    }
  }

  const canPay =
    mode === 'card' ||
    (mode === 'cash' && parseFloat(cashGiven.replace(',', '.') || '0') >= total) ||
    (mode === 'split' && parseFloat(splitCard.replace(',', '.') || '0') > 0 && parseFloat(splitCard.replace(',', '.') || '0') < total)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-[var(--text1)]">Encaissement</h2>
          <button onClick={onClose} className="text-[var(--text4)] hover:text-[var(--text2)] text-xl">×</button>
        </div>

        {/* Total */}
        <div className="text-center mb-6">
          <div className="text-4xl font-bold text-[var(--text1)] tabular-nums">
            {total.toFixed(2).replace('.', ',')} €
          </div>
          <p className="text-sm text-[var(--text3)] mt-1">Total TTC à encaisser</p>
        </div>

        {/* Mode de paiement */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {(['card', 'cash', 'split'] as PaymentMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={[
                'flex flex-col items-center gap-2 py-4 rounded-xl border-2 text-sm font-semibold transition-all',
                mode === m
                  ? 'border-[var(--blue)] bg-[var(--blue-light)] text-[var(--text1)]'
                  : 'border-[var(--border)] text-[var(--text3)] hover:border-[var(--border-active)]',
              ].join(' ')}
            >
              <span className="text-2xl">{m === 'card' ? '💳' : m === 'cash' ? '💶' : '⚡'}</span>
              <span>{m === 'card' ? 'CB' : m === 'cash' ? 'Espèces' : 'Split'}</span>
            </button>
          ))}
        </div>

        {/* Champs contextuels */}
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
            <label className="text-xs text-[var(--text3)] uppercase tracking-wider mb-2 block">
              Montant CB
            </label>
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

        {/* Ticket Resto désactivé V1 */}
        <p className="text-xs text-center text-[var(--text4)] mb-4">
          Ticket Restaurant — disponible prochainement
        </p>

        <button
          onClick={handlePay}
          disabled={!canPay || isPaying}
          className="w-full h-14 rounded-xl text-lg font-bold text-white transition-all disabled:opacity-40 hover:opacity-90"
          style={{ background: 'var(--green)' }}
        >
          {isPaying ? 'Traitement…' : '✓ Valider le paiement'}
        </button>
      </div>
    </div>
  )
}
