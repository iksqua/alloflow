// src/app/dashboard/stocks/commandes/_components/edit-modal.tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { PurchaseOrder } from './types'
import type { StockItem } from '../../_components/types'

interface Props {
  order: PurchaseOrder
  stockItems: StockItem[]
  onClose: () => void
  onSave: () => Promise<void>
}

interface EditLine {
  id?: string
  stockItemId: string
  name: string
  unit: string
  quantityOrdered: number
  unitPrice: number
  isLocked: boolean
}

export function EditModal({ order, stockItems, onClose, onSave }: Props) {
  const [supplier, setSupplier] = useState(order.supplier)
  const [deliveryDate, setDeliveryDate] = useState(order.requested_delivery_date ?? '')
  const [notes, setNotes] = useState(order.notes ?? '')
  const [lines, setLines] = useState<EditLine[]>(() =>
    (order.items ?? []).map(item => ({
      id:              item.id,
      stockItemId:     item.stock_item_id,
      name:            item.stock_item?.name ?? '',
      unit:            item.stock_item?.unit ?? '',
      quantityOrdered: item.quantity_ordered,
      unitPrice:       item.unit_price,
      isLocked:        (item.quantity_received ?? 0) > 0,
    }))
  )
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const existingStockIds = new Set(lines.map(l => l.stockItemId))
  const availableItems = stockItems.filter(i =>
    !existingStockIds.has(i.id) &&
    (search === '' || i.name.toLowerCase().includes(search.toLowerCase()))
  )

  function addItem(item: StockItem) {
    setLines(prev => [...prev, {
      stockItemId:     item.id,
      name:            item.name,
      unit:            item.unit,
      quantityOrdered: item.order_quantity || 1,
      unitPrice:       item.unit_price,
      isLocked:        false,
    }])
    setSearch('')
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  function updateLine(idx: number, field: 'quantityOrdered' | 'unitPrice', val: number) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l))
  }

  async function handleSave() {
    if (!supplier.trim()) { toast.error('Le fournisseur est requis'); return }

    const editableLines = lines.filter(l => !l.isLocked)

    setLoading(true)
    try {
      const upsert_items = editableLines.map(l => ({
        ...(l.id ? { id: l.id } : {}),
        stock_item_id:    l.stockItemId,
        quantity_ordered: l.quantityOrdered,
        unit_price:       l.unitPrice,
      }))

      const res = await fetch(`/api/purchase-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier,
          requested_delivery_date: deliveryDate || null,
          notes: notes || null,
          upsert_items,
          delete_item_ids: (order.items ?? [])
            .filter(orig => (orig.quantity_received ?? 0) === 0)
            .filter(orig => !editableLines.some(l => l.id === orig.id))
            .map(orig => orig.id),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Erreur lors de la modification')
        return
      }
      toast.success('Commande modifiée')
      await onSave()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
           style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
          <h2 className="font-bold text-[var(--text1)]">Modifier — {order.order_ref}</h2>
          <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text1)] text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Fournisseur *</label>
              <input
                type="text"
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] outline-none focus:border-[var(--blue)]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Date livraison</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={e => setDeliveryDate(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] outline-none focus:border-[var(--blue)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] outline-none focus:border-[var(--blue)] resize-none"
            />
          </div>

          {/* Lines */}
          <div>
            <div className="text-xs font-semibold text-[var(--text3)] uppercase tracking-wide mb-2">Articles</div>
            <div className="space-y-1.5">
              {lines.map((line, idx) => (
                <div key={line.id ?? line.stockItemId}
                     className={`flex items-center gap-2 rounded-lg px-3 py-2 border border-[var(--border)] ${line.isLocked ? 'opacity-60' : ''}`}
                     style={{ background: 'var(--surface2)' }}>
                  {line.isLocked && <span title="Ligne verrouillée (déjà reçue)">🔒</span>}
                  <span className="flex-1 text-sm text-[var(--text1)] truncate">{line.name}</span>
                  <input
                    type="number"
                    value={line.quantityOrdered}
                    disabled={line.isLocked}
                    min={0.001}
                    step={0.1}
                    onChange={e => updateLine(idx, 'quantityOrdered', parseFloat(e.target.value) || 0)}
                    className="w-16 text-xs text-right bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text1)] disabled:opacity-50"
                  />
                  <span className="text-xs text-[var(--text4)]">{line.unit}</span>
                  <input
                    type="number"
                    value={line.unitPrice}
                    disabled={line.isLocked}
                    min={0}
                    step={0.01}
                    onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                    className="w-16 text-xs text-right bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text1)] disabled:opacity-50"
                  />
                  <span className="text-xs text-[var(--text4)]">€</span>
                  {!line.isLocked && (
                    <button
                      onClick={() => removeLine(idx)}
                      className="text-red-400 hover:text-red-300 text-sm ml-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add new line */}
            <div className="mt-3">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Ajouter un article…"
                className="w-full rounded-lg px-3 py-2 text-sm bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] outline-none focus:border-[var(--blue)]"
              />
              {search && availableItems.length > 0 && (
                <div className="mt-1 rounded-lg border border-[var(--border)] overflow-hidden max-h-40 overflow-y-auto"
                     style={{ background: 'var(--surface)' }}>
                  {availableItems.slice(0, 10).map(item => (
                    <button
                      key={item.id}
                      onClick={() => addItem(item)}
                      className="w-full text-left px-3 py-2 text-sm text-[var(--text1)] hover:bg-[var(--surface2)] flex justify-between"
                    >
                      <span>{item.name}</span>
                      <span className="text-[var(--text4)] text-xs">{item.quantity} {item.unit}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-[var(--border)] px-5 py-3 flex gap-3 justify-end"
             style={{ background: 'var(--surface2)' }}>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm text-[var(--text2)] hover:bg-[var(--surface)] border border-[var(--border)]">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--blue)' }}
          >
            {loading ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
