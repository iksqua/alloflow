// src/app/dashboard/stocks/_components/stock-item-form.tsx
'use client'
import { useState, useEffect } from 'react'
import type { StockItem } from './types'

const UNITS = ['kg', 'g', 'L', 'cL', 'mL', 'u.', 'boîte', 'sac', 'carton']

interface Props {
  open: boolean
  item: StockItem | null
  onClose: () => void
  onSave: () => Promise<void>
}

export function StockItemForm({ open, item, onClose, onSave }: Props) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [unit, setUnit] = useState('kg')
  const [quantity, setQuantity] = useState('0')
  const [alertThreshold, setAlertThreshold] = useState('0')
  const [unitPrice, setUnitPrice] = useState('0')
  const [orderQuantity, setOrderQuantity] = useState('0')
  const [supplier, setSupplier] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(item?.name ?? '')
      setCategory(item?.category ?? '')
      setUnit(item?.unit ?? 'kg')
      setQuantity(String(item?.quantity ?? 0))
      setAlertThreshold(String(item?.alert_threshold ?? 0))
      setUnitPrice(String(item?.unit_price ?? 0))
      setOrderQuantity(String(item?.order_quantity ?? 0))
      setSupplier(item?.supplier ?? '')
      setError(null)
    }
  }, [open, item])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Le nom est requis'); return }
    setLoading(true); setError(null)
    try {
      const payload = {
        name: name.trim(),
        category: category.trim() || null,
        unit,
        quantity: parseFloat(quantity) || 0,
        alert_threshold: parseFloat(alertThreshold) || 0,
        unit_price: parseFloat(unitPrice) || 0,
        order_quantity: parseFloat(orderQuantity) || 0,
        supplier: supplier.trim() || null,
      }
      const url  = item ? `/api/stock-items/${item.id}` : '/api/stock-items'
      const method = item ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erreur serveur'); }
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
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] p-6" style={{ background: 'var(--surface)' }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-[var(--text1)]">{item ? 'Modifier l\'article' : 'Nouvel article'}</h2>
            <p className="text-xs text-[var(--text3)] mt-0.5">Saisissez les informations de l'article de stock</p>
          </div>
          <button onClick={onClose} className="text-lg text-[var(--text3)] hover:text-[var(--text1)] transition-colors cursor-pointer">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Nom de l'article *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
              style={{ background: 'var(--surface2)' }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Catégorie</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Épicerie sèche"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Fournisseur</label>
              <input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Métro"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Unité</label>
              <select value={unit} onChange={e => setUnit(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }}>
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Stock actuel</label>
              <input type="number" step="0.001" value={quantity} onChange={e => setQuantity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Seuil d'alerte</label>
              <input type="number" step="0.001" value={alertThreshold} onChange={e => setAlertThreshold(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Prix unitaire (€)</label>
              <input type="number" step="0.001" value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Qté à commander</label>
              <input type="number" step="0.001" value={orderQuantity} onChange={e => setOrderQuantity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }} />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex gap-3 mt-6 pt-5 border-t border-[var(--border)]">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors">Annuler</button>
            <button type="submit" disabled={loading}
              className="flex-2 px-6 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: 'var(--blue)' }}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
