'use client'
import type { LocalTicket, LoyaltyCustomer, LoyaltyReward } from '../types'
import { LoyaltyBadge } from './loyalty-badge'

interface TicketPanelProps {
  ticket: LocalTicket
  onUpdateQuantity: (productId: string, delta: number) => void
  onRemove: (productId: string) => void
  onClear: () => void
  onDiscount: () => void
  onPay: () => void
  sessionOpen: boolean
  linkedCustomer:   LoyaltyCustomer | null
  linkedReward:     LoyaltyReward | null
  loyaltyDone:      boolean
  onLoyaltyTrigger: () => void
  onLoyaltySkip:    () => void
}

function computeTicketTotals(ticket: LocalTicket) {
  let subtotalHt = 0
  let totalTax = 0

  for (const item of ticket.items) {
    const lineHt = item.unitPriceHt * item.quantity
    const lineTax = lineHt * (item.tvaRate / 100)
    subtotalHt += lineHt
    totalTax += lineTax
  }

  let discountAmount = 0
  if (ticket.discount) {
    discountAmount = ticket.discount.type === 'percent'
      ? subtotalHt * (ticket.discount.value / 100)
      : ticket.discount.value
  }

  const discountedHt = subtotalHt - discountAmount
  const ratio = subtotalHt > 0 ? discountedHt / subtotalHt : 1
  const adjustedTax = totalTax * ratio
  const total = discountedHt + adjustedTax

  return { subtotalHt, discountAmount, total }
}

function computeLoyaltyDiscount(reward: LoyaltyReward | null, total: number): number {
  if (!reward) return 0
  return reward.discount_type === 'percent'
    ? Math.round(total * (reward.discount_value / 100) * 100) / 100
    : reward.discount_value
}

export function TicketPanel({
  ticket,
  onUpdateQuantity,
  onRemove,
  onClear,
  onDiscount,
  onPay,
  sessionOpen,
  linkedCustomer,
  linkedReward,
  loyaltyDone,
  onLoyaltyTrigger,
  onLoyaltySkip,
}: TicketPanelProps) {
  const { subtotalHt, discountAmount, total } = computeTicketTotals(ticket)
  const isEmpty = ticket.items.length === 0
  const loyaltyDiscountAmount = loyaltyDone ? computeLoyaltyDiscount(linkedReward, total) : 0
  const finalTotal = Math.max(0, total - loyaltyDiscountAmount)

  return (
    <div
      className="flex flex-col flex-shrink-0 border-l border-[var(--border)]"
      style={{ width: '360px', background: 'var(--surface)' }}
    >
      {/* Header ticket */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <span className="text-sm font-semibold text-[var(--text1)]">
          Ticket {ticket.tableId ? `· Table` : ''}
        </span>
        {!isEmpty && (
          <button
            onClick={onClear}
            className="text-xs text-[var(--text4)] hover:text-[var(--red)] transition-colors"
          >
            Effacer
          </button>
        )}
      </div>

      {/* Liste articles */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <span className="text-4xl mb-3 opacity-20">🛒</span>
            <p className="text-sm text-[var(--text4)]">Sélectionnez des produits</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {ticket.items.map((item) => {
              const lineTtc = item.unitPriceHt * item.quantity * (1 + item.tvaRate / 100)
              return (
                <div key={item.productId} className="flex items-center gap-3 px-4 py-3">
                  {item.emoji && <span className="text-lg flex-shrink-0">{item.emoji}</span>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text1)] truncate">{item.productName}</p>
                    <p className="text-xs text-[var(--text4)]">
                      {item.unitPriceHt.toFixed(2).replace('.', ',')} € HT · TVA {item.tvaRate}%
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => onUpdateQuantity(item.productId, -1)}
                      className="w-6 h-6 rounded flex items-center justify-center text-sm text-[var(--text3)] hover:bg-[var(--surface2)] transition-colors"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-semibold text-[var(--text1)] tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => onUpdateQuantity(item.productId, 1)}
                      className="w-6 h-6 rounded flex items-center justify-center text-sm text-[var(--text3)] hover:bg-[var(--surface2)] transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <div className="w-16 text-right flex-shrink-0">
                    <span className="text-sm font-semibold text-[var(--text1)] tabular-nums">
                      {lineTtc.toFixed(2).replace('.', ',')} €
                    </span>
                  </div>
                  <button
                    onClick={() => onRemove(item.productId)}
                    className="w-6 h-6 rounded flex items-center justify-center text-xs text-[var(--text4)] hover:text-[var(--red)] hover:bg-[var(--red-bg)] transition-colors"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Totaux + Actions */}
      <div className="border-t border-[var(--border)] p-4 space-y-3">
        {!isEmpty && (
          <>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-[var(--text3)]">
                <span>Sous-total HT</span>
                <span className="tabular-nums">{subtotalHt.toFixed(2).replace('.', ',')} €</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-[var(--green)]">
                  <span>Remise {ticket.discount?.type === 'percent' ? `−${ticket.discount.value}%` : ''}</span>
                  <span className="tabular-nums">−{discountAmount.toFixed(2).replace('.', ',')} €</span>
                </div>
              )}
              {loyaltyDone && loyaltyDiscountAmount > 0 && linkedReward && (
                <div className="flex justify-between text-[var(--green)]">
                  <span>🎁 {linkedReward.name}</span>
                  <span className="tabular-nums">−{loyaltyDiscountAmount.toFixed(2).replace('.', ',')} €</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--text1)] font-bold text-base pt-1 border-t border-[var(--border)]">
                <span>Total TTC</span>
                <span className="tabular-nums">{finalTotal.toFixed(2).replace('.', ',')} €</span>
              </div>
            </div>

            <button
              onClick={onDiscount}
              className="w-full h-9 rounded-lg text-sm font-medium text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
            >
              Appliquer une remise
            </button>

            {/* Loyalty Badge — shown after identification */}
            {loyaltyDone && linkedCustomer && (
              <LoyaltyBadge
                customer={linkedCustomer}
                reward={linkedReward}
                orderTotal={total}
              />
            )}
          </>
        )}

        {/* Loyalty Trigger OR Encaisser */}
        {!isEmpty && !loyaltyDone ? (
          <div className="space-y-2">
            <button
              onClick={onLoyaltyTrigger}
              disabled={!sessionOpen}
              className="w-full h-12 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-30 hover:opacity-90"
              style={{ background: '#d97706' }}
            >
              🎁 Identifier le client →
            </button>
            <div className="text-center">
              <button
                onClick={onLoyaltySkip}
                disabled={!sessionOpen}
                className="text-xs text-[var(--text4)] hover:text-[var(--text2)] disabled:opacity-30"
              >
                Passer sans fidélité
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onPay}
            disabled={isEmpty || !sessionOpen}
            className="w-full h-12 rounded-xl text-base font-bold text-white transition-all disabled:opacity-30 hover:opacity-90"
            style={{ background: isEmpty ? 'var(--border)' : 'var(--green)' }}
          >
            {!sessionOpen
              ? 'Ouvrir la session'
              : isEmpty
                ? 'Ticket vide'
                : `Encaisser ${finalTotal.toFixed(2).replace('.', ',')} €`}
          </button>
        )}
      </div>
    </div>
  )
}
