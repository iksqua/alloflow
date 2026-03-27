// src/app/dashboard/stocks/_components/purchase-order-form.tsx
'use client'
import { useState, useEffect } from 'react'
import type { StockItem } from './types'

interface OrderLine { stockItemId: string; quantityOrdered: number; unitPrice: number }

interface Props {
  open: boolean
  items: StockItem[]
  onClose: () => void
  onSave: () => Promise<void>
}

export function PurchaseOrderForm({ open, items, onClose, onSave }: Props) {
  const alertItems = items.filter(i => i.status !== 'ok')

  const [supplier, setSupplier] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [lines, setLines] = useState<OrderLine[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form state when modal opens — prevents stale lines on re-open
  useEffect(() => {
    if (open) {
      setSupplier('')
      setDeliveryDate('')
      setLines(
        alertItems.map(i => ({ stockItemId: i.id, quantityOrdered: i.order_quantity || 1, unitPrice: i.unit_price }))
      )
      setError(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const totalHt = lines.reduce((s, l) => s + l.quantityOrdered * l.unitPrice, 0)

  function addLine() {
    setLines(prev => [...prev, { stockItemId: '', quantityOrdered: 1, unitPrice: 0 }])
  }

  function updateLine(idx: number, field: keyof OrderLine, value: string | number) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplier.trim()) { setError('Le fournisseur est requis'); return }
    const validLines = lines.filter(l => l.stockItemId && l.quantityOrdered > 0)
    if (validLines.length === 0) { setError('Ajoutez au moins un article'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier: supplier.trim(),
          requested_delivery_date: deliveryDate || null,
          items: validLines.map(l => ({
            stock_item_id:    l.stockItemId,
            quantity_ordered: l.quantityOrdered,
            unit_price:       l.unitPrice,
          })),
        }),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: 'var(--overlay-bg)' }}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--border)] p-6" style={{ background: 'var(--surface)' }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-[var(--text1)]">Nouveau bon de commande</h2>
            <p className="text-xs text-[var(--text3)] mt-0.5">Créez une commande fournisseur pour vos articles en alerte</p>
          </div>
          <button onClick={onClose} className="text-lg text-[var(--text3)] hover:text-[var(--text1)] transition-colors cursor-pointer">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Fournisseur *</label>
              <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Métro, Transgourmet..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Date de livraison souhaitée</label>
              <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Articles</label>
              <button type="button" onClick={addLine} className="text-xs text-[var(--blue)] hover:underline">+ Ajouter</button>
            </div>
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[var(--border)]">
                  <th className="text-left px-3 py-2 text-xs text-[var(--text4)]">Article</th>
                  <th className="text-left px-3 py-2 text-xs text-[var(--text4)]">Qté</th>
                  <th className="text-left px-3 py-2 text-xs text-[var(--text4)]">Prix unit.</th>
                  <th className="px-3 py-2 text-xs text-[var(--text4)]">Total</th>
                  <th />
                </tr></thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const si = items.find(i => i.id === line.stockItemId)
                    return (
                      <tr key={idx} className="border-b border-[var(--border)]/50 last:border-0">
                        <td className="px-3 py-2">
                          <select value={line.stockItemId} onChange={e => {
                            const found = items.find(i => i.id === e.target.value)
                            updateLine(idx, 'stockItemId', e.target.value)
                            if (found) updateLine(idx, 'unitPrice', found.unit_price)
                          }} className="w-full px-2 py-1 rounded border border-[var(--border)] text-[var(--text2)] text-xs focus:outline-none focus:border-[var(--blue)] transition-colors"
                             style={{ background: 'var(--surface2)' }}>
                            <option value="">— Choisir —</option>
                            {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.001" value={line.quantityOrdered}
                            onChange={e => updateLine(idx, 'quantityOrdered', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 rounded border border-[var(--border)] text-[var(--text2)] text-xs focus:outline-none focus:border-[var(--blue)] transition-colors"
                            style={{ background: 'var(--surface2)' }} />
                          {si && <span className="ml-1 text-xs text-[var(--text4)]">{si.unit}</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.001" value={line.unitPrice}
                            onChange={e => updateLine(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 rounded border border-[var(--border)] text-[var(--text2)] text-xs focus:outline-none focus:border-[var(--blue)] transition-colors"
                            style={{ background: 'var(--surface2)' }} />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-[var(--text2)] text-xs">
                          {(line.quantityOrdered * line.unitPrice).toFixed(2)} €
                        </td>
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => removeLine(idx)} className="text-xs text-red-500/60 hover:text-red-400">✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between items-center py-2 border-t border-[var(--border)]">
            <span className="text-sm text-[var(--text3)]">Total HT</span>
            <span className="text-lg font-bold text-[var(--text1)]">{totalHt.toFixed(2)} €</span>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 mt-6 pt-5 border-t border-[var(--border)]">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">Annuler</button>
            <button type="submit" disabled={loading}
              className="flex-2 px-6 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--blue)' }}>
              {loading ? 'Création...' : '📤 Créer le bon de commande'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
