// src/app/dashboard/stocks/commandes/_components/purchase-orders-page-client.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { PurchaseOrder, PurchaseOrderStatus } from './types'
import type { StockItem } from '../../_components/types'
import { PurchaseOrdersList } from './purchase-orders-list'
import { PurchaseOrderDetailPanel } from './purchase-order-detail-panel'
import { PurchaseOrderForm } from './purchase-order-form'
import { ReceiveModal } from './receive-modal'
import { EditModal } from './edit-modal'
import { CancelModal } from './cancel-modal'

interface Category { id: string; name: string; color_hex: string }

interface Props {
  initialOrders: PurchaseOrder[]
  stockItems: StockItem[]
  categories: Category[]
  totalCount: number
}

export type ModalState =
  | { type: 'none' }
  | { type: 'create' }
  | { type: 'receive'; order: PurchaseOrder }
  | { type: 'edit';    order: PurchaseOrder }
  | { type: 'cancel';  order: PurchaseOrder }

export function PurchaseOrdersPageClient({ initialOrders, stockItems, categories, totalCount }: Props) {
  const [orders, setOrders] = useState(initialOrders)
  const [statusFilter, setStatusFilter] = useState<PurchaseOrderStatus | 'all'>('all')
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })

  const counts = {
    all:       orders.length,
    pending:   orders.filter(o => o.status === 'pending').length,
    partial:   orders.filter(o => o.status === 'partial').length,
    received:  orders.filter(o => o.status === 'received').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  }

  const totalEngaged = orders
    .filter(o => o.status === 'pending' || o.status === 'partial')
    .reduce((s, o) => s + o.total_ht, 0)

  const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter)

  async function reload() {
    const res = await fetch('/api/purchase-orders')
    if (!res.ok) { toast.error('Erreur de chargement'); return }
    const json = await res.json()
    setOrders(json.orders ?? [])
    if (selectedOrder) {
      const updated = (json.orders ?? []).find((o: PurchaseOrder) => o.id === selectedOrder.id)
      setSelectedOrder(updated ?? null)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text1)]">Commandes fournisseurs</h1>
          <p className="text-sm text-[var(--text3)] mt-0.5">
            Montant engagé : <span className="font-semibold text-[var(--text1)]">{totalEngaged.toFixed(2)} €</span>
          </p>
        </div>
        <button
          onClick={() => setModal({ type: 'create' })}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'var(--blue)' }}
        >
          📥 Nouvelle commande
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
        {([
          ['all', 'Toutes', counts.all],
          ['pending', 'En cours', counts.pending],
          ['partial', 'Partielles', counts.partial],
          ['received', 'Reçues', counts.received],
          ['cancelled', 'Annulées', counts.cancelled],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              statusFilter === key
                ? 'border-[var(--blue)] text-white'
                : 'border-transparent text-[var(--text3)] hover:text-[var(--text2)]'
            }`}
          >
            {label}{count > 0 ? ` (${count})` : ''}
          </button>
        ))}
      </div>

      {/* List */}
      <PurchaseOrdersList
        orders={filtered}
        onSelectOrder={setSelectedOrder}
        onReceive={order => setModal({ type: 'receive', order })}
        onEdit={order => setModal({ type: 'edit', order })}
        onCancel={order => setModal({ type: 'cancel', order })}
      />

      {/* Detail panel */}
      {selectedOrder && (
        <PurchaseOrderDetailPanel
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onReceive={() => setModal({ type: 'receive', order: selectedOrder })}
          onEdit={() => setModal({ type: 'edit', order: selectedOrder })}
          onCancel={() => setModal({ type: 'cancel', order: selectedOrder })}
        />
      )}

      {/* Modals */}
      {modal.type === 'create' && (
        <PurchaseOrderForm
          stockItems={stockItems}
          categories={categories}
          onClose={() => setModal({ type: 'none' })}
          onSave={async () => { setModal({ type: 'none' }); await reload() }}
        />
      )}
      {modal.type === 'receive' && (
        <ReceiveModal
          order={modal.order}
          onClose={() => setModal({ type: 'none' })}
          onSave={async () => { setModal({ type: 'none' }); await reload() }}
        />
      )}
      {modal.type === 'edit' && (
        <EditModal
          order={modal.order}
          stockItems={stockItems}
          onClose={() => setModal({ type: 'none' })}
          onSave={async () => { setModal({ type: 'none' }); await reload() }}
        />
      )}
      {modal.type === 'cancel' && (
        <CancelModal
          order={modal.order}
          onClose={() => setModal({ type: 'none' })}
          onConfirm={async () => { setModal({ type: 'none' }); await reload() }}
        />
      )}
    </div>
  )
}
