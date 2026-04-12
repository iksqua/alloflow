// src/app/dashboard/stocks/commandes/_components/receive-modal.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { PurchaseOrder } from './types'
import { remaining } from './types'

interface Props {
  order: PurchaseOrder
  onClose: () => void
  onSave: () => Promise<void>
}

export function ReceiveModal({ order, onClose, onSave }: Props) {
  const pendingItems = (order.items ?? []).filter(item => remaining(item) > 0)

  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(pendingItems.map(item => [item.id, remaining(item)]))
  )
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  function updateQty(itemId: string, val: number) {
    setQuantities(prev => ({ ...prev, [itemId]: Math.max(0, val) }))
  }

  async function handleConfirm() {
    const itemsToSend = pendingItems
      .map(item => ({ purchase_order_item_id: item.id, quantity_received: quantities[item.id] ?? 0 }))
      .filter(i => i.quantity_received > 0)

    if (itemsToSend.length === 0) {
      toast.error('Saisissez au moins une quantité reçue')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${order.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes || null, items: itemsToSend }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Erreur lors de la réception')
        return
      }
      toast.success('Réception enregistrée')
      await onSave()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
          <div>
            <h2 className="font-bold text-[var(--text1)]">Réception</h2>
            <p className="text-xs text-[var(--text3)] mt-0.5">{order.order_ref} · {order.supplier}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text1)] text-xl">×</button>
        </div>

        {/* Table */}
        <div className="p-5">
          <table className="w-full text-xs mb-4">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left pb-2 text-[var(--text3)]">Article</th>
                <th className="text-right pb-2 text-[var(--text3)]">Commandé</th>
                <th className="text-right pb-2 text-[var(--text3)]">Déjà reçu</th>
                <th className="text-right pb-2 text-[var(--text3)]">Restant</th>
                <th className="text-right pb-2 text-[var(--text3)]">Reçu aujourd&apos;hui</th>
              </tr>
            </thead>
            <tbody>
              {pendingItems.map(item => {
                const rem = remaining(item)
                return (
                  <tr key={item.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 text-[var(--text1)]">{item.stock_item?.name}</td>
                    <td className="py-2 text-right text-[var(--text2)]">{item.quantity_ordered} {item.stock_item?.unit}</td>
                    <td className="py-2 text-right text-[var(--text2)]">{item.quantity_received ?? 0} {item.stock_item?.unit}</td>
                    <td className="py-2 text-right text-amber-400 font-semibold">{rem} {item.stock_item?.unit}</td>
                    <td className="py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={rem}
                        step={0.1}
                        value={quantities[item.id] ?? rem}
                        onChange={e => updateQty(item.id, parseFloat(e.target.value) || 0)}
                        className="w-16 text-right text-sm bg-[var(--surface2)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text1)]"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Notes */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Observations sur cette livraison…"
              className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] outline-none focus:border-[var(--blue)] resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface2)] border border-[var(--border)]"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--blue)' }}
            >
              {loading ? 'Enregistrement…' : 'Confirmer la réception'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
