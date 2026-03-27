// src/app/dashboard/stocks/_components/receive-delivery-modal.tsx
'use client'
import { useState, useEffect } from 'react'
import type { PurchaseOrder, PurchaseOrderItem } from './types'

interface Props {
  open: boolean
  order: PurchaseOrder | null
  onClose: () => void
  onSave: () => Promise<void>
}

export function ReceiveDeliveryModal({ open, order, onClose, onSave }: Props) {
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && order?.items) {
      const init: Record<string, string> = {}
      order.items.forEach(item => {
        init[item.id] = String(item.quantity_ordered)
      })
      setQuantities(init)
      setError(null)
    }
  }, [open, order])

  if (!open || !order) return null

  const items: PurchaseOrderItem[] = order.items ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const payload = {
        items: items.map(item => ({
          purchase_order_item_id: item.id,
          quantity_received: parseFloat(quantities[item.id] ?? '0') || 0,
        })),
      }
      const res = await fetch(`/api/purchase-orders/${order!.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erreur') }
      await onSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[600px] max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] p-6" style={{ background: 'var(--surface)' }}>
        <h2 className="text-base font-bold text-[var(--text1)] mb-1">Réception livraison</h2>
        <p className="text-xs text-[var(--text4)] mb-5">{order.order_ref} · {order.supplier}</p>
        <form onSubmit={handleSubmit}>
          <div className="rounded-lg border border-[var(--border)] overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-xs text-[var(--text4)]">Article</th>
                  <th className="text-right px-3 py-2 text-xs text-[var(--text4)]">Commandé</th>
                  <th className="text-right px-3 py-2 text-xs text-[var(--text4)]">Reçu</th>
                  <th className="text-right px-3 py-2 text-xs text-[var(--text4)]">Écart</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const received = parseFloat(quantities[item.id] ?? '0') || 0
                  const ecart = received - item.quantity_ordered
                  return (
                    <tr key={item.id} className="border-b border-[var(--border)]/50 last:border-0">
                      <td className="px-3 py-2 text-[var(--text2)]">
                        {item.stock_item?.name ?? '—'}
                        <span className="ml-1 text-xs text-[var(--text4)]">{item.stock_item?.unit}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--text3)]">{item.quantity_ordered}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={quantities[item.id] ?? ''}
                          onChange={e => setQuantities(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className="w-20 px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-xs text-right"
                        />
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-semibold ${
                        ecart < 0 ? 'text-red-400' : ecart > 0 ? 'text-amber-400' : 'text-green-400'
                      }`}>
                        {ecart > 0 ? '+' : ''}{ecart !== 0 ? ecart.toFixed(2) : '✓'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text3)]">Annuler</button>
            <button type="submit" disabled={loading}
              className="flex-2 px-6 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--blue)' }}>
              {loading ? 'Enregistrement...' : '✓ Confirmer réception'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
