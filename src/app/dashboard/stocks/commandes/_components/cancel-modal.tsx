// src/app/dashboard/stocks/commandes/_components/cancel-modal.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { PurchaseOrder } from './types'

interface Props {
  order: PurchaseOrder
  onClose: () => void
  onConfirm: () => Promise<void>
}

export function CancelModal({ order, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const res = await fetch(`/api/purchase-orders/${order.id}/cancel`, { method: 'PATCH' })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? "Erreur lors de l'annulation")
        return
      }
      toast.success('Commande annulée')
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-80 rounded-2xl p-6 shadow-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-bold text-[var(--text1)] mb-1">Annuler la commande {order.order_ref} ?</h3>
        <p className="text-sm text-[var(--text3)] mb-2">Les stocks ne seront pas affectés.</p>
        <p className="text-sm text-[var(--text3)] mb-5">Les quantités déjà réceptionnées restent en stock.</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface2)] border border-[var(--border)]"
          >
            Retour
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--red)' }}
          >
            {loading ? 'Annulation…' : "Confirmer l'annulation"}
          </button>
        </div>
      </div>
    </div>
  )
}
