// src/app/dashboard/stocks/_components/stocks-page-client.tsx
'use client'
import { useState } from 'react'
import { StockItemsTable } from './stock-items-table'
import { StockItemForm } from './stock-item-form'
import { PurchaseOrderForm } from './purchase-order-form'
import type { StockItem, PurchaseOrder } from './types'

interface Props {
  initialItems: StockItem[]
  initialOrders: PurchaseOrder[]
}

export function StocksPageClient({ initialItems, initialOrders }: Props) {
  const [items, setItems] = useState(initialItems)
  const [orders, setOrders] = useState(initialOrders)
  const [tab, setTab] = useState<'inventory' | 'orders'>('inventory')
  const [showItemForm, setShowItemForm] = useState(false)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [editingItem, setEditingItem] = useState<StockItem | null>(null)

  const alerts    = items.filter(i => i.status === 'alert').length
  const outOfStock = items.filter(i => i.status === 'out_of_stock').length
  const pendingOrders = orders.filter(o => o.status === 'sent').length

  async function reloadItems() {
    const res = await fetch('/api/stock-items')
    const json = await res.json()
    setItems(json.items ?? [])
  }

  async function reloadOrders() {
    const res = await fetch('/api/purchase-orders')
    const json = await res.json()
    setOrders(json.orders ?? [])
  }

  return (
    <div style={{ paddingLeft: '220px', minHeight: '100vh', background: 'var(--bg)' }}>
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text1)]">Stocks & Approvisionnement</h1>
            {(alerts > 0 || outOfStock > 0) && (
              <p className="text-sm text-amber-400 mt-0.5">
                {outOfStock > 0 && `${outOfStock} rupture${outOfStock > 1 ? 's' : ''} · `}
                {alerts > 0 && `${alerts} alerte${alerts > 1 ? 's' : ''}`}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setShowOrderForm(true) }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text3)] hover:bg-[var(--surface)]"
            >
              📥 Commander
            </button>
            <button
              onClick={() => { setEditingItem(null); setShowItemForm(true) }}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'var(--blue)' }}
            >
              + Nouvel article
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Articles', value: items.length, color: 'text-[var(--text1)]' },
            { label: 'Alertes', value: alerts, color: 'text-amber-400' },
            { label: 'Ruptures', value: outOfStock, color: 'text-red-400' },
            { label: 'Commandes en cours', value: pendingOrders, color: 'text-[var(--text1)]' },
          ].map(kpi => (
            <div key={kpi.label} className="rounded-xl p-4 border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
              <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs text-[var(--text3)] uppercase tracking-wide mt-1">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-[var(--border)]">
          {(['inventory', 'orders'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                tab === t
                  ? 'border-[var(--blue)] text-white'
                  : 'border-transparent text-[var(--text3)] hover:text-[var(--text2)]'
              }`}
            >
              {t === 'inventory' ? `Inventaire (${items.length})` : `Commandes (${orders.length})`}
            </button>
          ))}
        </div>

        {tab === 'inventory' && (
          <StockItemsTable
            items={items}
            onEdit={item => { setEditingItem(item); setShowItemForm(true) }}
            onDelete={async id => {
              await fetch(`/api/stock-items/${id}`, { method: 'DELETE' })
              await reloadItems()
            }}
          />
        )}

        {tab === 'orders' && (
          <div className="space-y-3">
            {orders.length === 0 && (
              <div className="text-center py-16 text-[var(--text4)]">
                <div className="text-4xl mb-3">📥</div>
                <div className="font-semibold">Aucune commande fournisseur</div>
                <div className="text-sm mt-1">Créez votre premier bon de commande</div>
              </div>
            )}
            {orders.map(order => (
              <div key={order.id} className="rounded-xl p-4 border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-[var(--text1)]">{order.order_ref}</span>
                    <span className="mx-2 text-[var(--text4)]">·</span>
                    <span className="text-[var(--text3)]">{order.supplier}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-[var(--text1)]">{order.total_ht.toFixed(2)} €</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      order.status === 'received' ? 'bg-green-900/30 text-green-400' :
                      order.status === 'sent' ? 'bg-blue-900/30 text-blue-400' :
                      order.status === 'partial' ? 'bg-amber-900/30 text-amber-400' :
                      'bg-[var(--surface2)] text-[var(--text4)]'
                    }`}>
                      {order.status === 'draft' ? 'Brouillon' : order.status === 'sent' ? 'Envoyé' : order.status === 'received' ? 'Reçu' : 'Partiel'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <StockItemForm
        open={showItemForm}
        item={editingItem}
        onClose={() => setShowItemForm(false)}
        onSave={async () => { setShowItemForm(false); await reloadItems() }}
      />
      <PurchaseOrderForm
        open={showOrderForm}
        items={items}
        onClose={() => setShowOrderForm(false)}
        onSave={async () => { setShowOrderForm(false); await reloadOrders() }}
      />
    </div>
  )
}
