// src/app/dashboard/stocks/commandes/_components/purchase-orders-list.tsx
'use client'
import { useState, useEffect, useRef } from 'react'
import type { PurchaseOrder } from './types'
import { statusLabel, statusBadgeClass, isLate } from './types'

interface Props {
  orders: PurchaseOrder[]
  onSelectOrder: (order: PurchaseOrder) => void
  onReceive: (order: PurchaseOrder) => void
  onEdit: (order: PurchaseOrder) => void
  onCancel: (order: PurchaseOrder) => void
}

function ActionsMenu({ order, onReceive, onEdit, onCancel }: {
  order: PurchaseOrder
  onReceive: (o: PurchaseOrder) => void
  onEdit: (o: PurchaseOrder) => void
  onCancel: (o: PurchaseOrder) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        className="text-[var(--text3)] hover:text-[var(--text1)] px-1 py-0.5 rounded hover:bg-[var(--surface2)] text-lg leading-none"
      >
        •••
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-32 rounded-lg shadow-lg border border-[var(--border)] z-20"
          style={{ background: 'var(--surface)' }}
        >
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onEdit(order) }}
            className="w-full text-left px-3 py-2 text-sm text-[var(--text2)] hover:bg-[var(--surface2)] rounded-t-lg"
          >
            Modifier
          </button>
          <button
            onClick={e => { e.stopPropagation(); setOpen(false); onCancel(order) }}
            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-900/10 rounded-b-lg"
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  )
}

export function PurchaseOrdersList({ orders, onSelectOrder, onReceive, onEdit, onCancel }: Props) {
  if (orders.length === 0) {
    return (
      <div className="text-center py-16 text-[var(--text4)]">
        <div className="text-4xl mb-3">📥</div>
        <div className="font-semibold text-[var(--text2)]">Aucune commande</div>
        <div className="text-sm mt-1">Créez votre premier bon de commande</div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--border)] overflow-x-auto" style={{ background: 'var(--surface)' }}>
      <table className="w-full text-sm min-w-[580px]">
        <thead>
          <tr className="border-b border-[var(--border)]" style={{ background: 'var(--surface2)' }}>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text3)] uppercase tracking-wide">Réf</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text3)] uppercase tracking-wide">Fournisseur</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--text3)] uppercase tracking-wide hidden sm:table-cell">Articles</th>
            <th className="text-right px-4 py-2.5 text-xs font-semibold text-[var(--text3)] uppercase tracking-wide">Montant HT</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text3)] uppercase tracking-wide hidden md:table-cell">Livraison</th>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text3)] uppercase tracking-wide">Statut</th>
            <th className="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {orders.map(order => (
            <tr
              key={order.id}
              onClick={() => onSelectOrder(order)}
              className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface2)] cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 font-mono text-[var(--text2)] font-medium text-xs">{order.order_ref}</td>
              <td className="px-4 py-3 text-[var(--text1)] font-medium">{order.supplier}</td>
              <td className="px-4 py-3 text-right text-[var(--text3)] hidden sm:table-cell">{order.items?.length ?? '—'}</td>
              <td className="px-4 py-3 text-right font-semibold text-[var(--text1)]">{order.total_ht.toFixed(2)} €</td>
              <td className="px-4 py-3 hidden md:table-cell">
                {order.requested_delivery_date ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-[var(--text3)]">
                      {new Date(order.requested_delivery_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                    {isLate(order) && (
                      <span className="text-xs font-semibold text-red-400 bg-red-900/20 px-1.5 py-0.5 rounded">En retard</span>
                    )}
                  </span>
                ) : (
                  <span className="text-[var(--text4)]">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${statusBadgeClass(order.status)}`}>
                  {statusLabel(order.status)}
                </span>
              </td>
              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 justify-end">
                  {(order.status === 'pending' || order.status === 'partial') && (
                    <button
                      onClick={() => onReceive(order)}
                      className="text-xs px-2 py-1 rounded-lg font-semibold text-white"
                      style={{ background: 'var(--blue)' }}
                    >
                      Réceptionner
                    </button>
                  )}
                  {order.status !== 'received' && order.status !== 'cancelled' && (
                    <ActionsMenu order={order} onReceive={onReceive} onEdit={onEdit} onCancel={onCancel} />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
