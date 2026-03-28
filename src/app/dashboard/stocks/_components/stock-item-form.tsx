// src/app/dashboard/stocks/_components/stock-item-form.tsx
'use client'
import { useState, useEffect } from 'react'
import type { StockItem } from './types'

const UNITS = ['kg', 'g', 'L', 'cL', 'mL', 'u.', 'boîte', 'sac', 'carton']
const TVA_RATES = [5.5, 10, 20]

interface Category { id: string; name: string; color_hex: string }

interface Props {
  open: boolean
  item: StockItem | null
  categories: Category[]
  onClose: () => void
  onSave: () => Promise<void>
}

export function StockItemForm({ open, item, categories, onClose, onSave }: Props) {
  const [name,          setName]          = useState('')
  const [category,      setCategory]      = useState('')
  const [unit,          setUnit]          = useState('kg')
  const [quantity,      setQuantity]      = useState('0')
  const [alertThreshold, setAlertThreshold] = useState('0')
  const [unitPrice,     setUnitPrice]     = useState('0')
  const [orderQuantity, setOrderQuantity] = useState('0')
  const [supplier,      setSupplier]      = useState('')
  const [supplierRef,   setSupplierRef]   = useState('')
  // Purchase price calculator
  const [purchaseTotal, setPurchaseTotal] = useState('')
  const [purchaseQty,   setPurchaseQty]   = useState('')
  // POS / Vendu en caisse
  const [isPos,         setIsPos]         = useState(false)
  const [posPrice,      setPosPrice]      = useState('')
  const [posTvaRate,    setPosTvaRate]    = useState(10)
  const [posCategoryId, setPosCategoryId] = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)

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
      setSupplierRef(item?.supplier_ref ?? '')
      // Restore calculator values if previously saved
      setPurchaseTotal(item?.purchase_price ? String(item.purchase_price) : '')
      setPurchaseQty(item?.purchase_qty ? String(item.purchase_qty) : '')
      // POS
      setIsPos(item?.is_pos ?? false)
      setPosPrice(item?.pos_price != null ? String(item.pos_price) : '')
      setPosTvaRate(item?.pos_tva_rate ?? 10)
      setPosCategoryId(item?.pos_category_id ?? '')
      setError(null)
    }
  }, [open, item])

  // Auto-apply computed price — MUST be before early return (Rules of Hooks)
  useEffect(() => {
    const total = parseFloat(purchaseTotal)
    const qty   = parseFloat(purchaseQty)
    if (total > 0 && qty > 0) {
      setUnitPrice((total / qty).toFixed(4))
    }
  }, [purchaseTotal, purchaseQty])

  if (!open) return null

  // Derived display value (render-only, not for hooks)
  const purchaseTotalNum  = parseFloat(purchaseTotal)
  const purchaseQtyNum    = parseFloat(purchaseQty)
  const computedUnitPrice = purchaseTotalNum > 0 && purchaseQtyNum > 0
    ? purchaseTotalNum / purchaseQtyNum
    : null

  function applyComputed() {
    if (computedUnitPrice !== null) setUnitPrice(computedUnitPrice.toFixed(4))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Le nom est requis'); return }
    if (isPos && !posPrice) { setError('Le prix de vente est requis pour un article vendu en caisse'); return }
    setLoading(true); setError(null)
    try {
      const payload = {
        name:            name.trim(),
        category:        category.trim() || null,
        unit,
        quantity:        parseFloat(quantity) || 0,
        alert_threshold: parseFloat(alertThreshold) || 0,
        unit_price:      parseFloat(unitPrice) || 0,
        order_quantity:  parseFloat(orderQuantity) || 0,
        supplier:        supplier.trim() || null,
        supplier_ref:    supplierRef.trim() || null,
        purchase_price:  parseFloat(purchaseTotal) || 0,
        purchase_qty:    parseFloat(purchaseQty) || 0,
        is_pos:          isPos,
        pos_price:       isPos && posPrice ? parseFloat(posPrice) : null,
        pos_tva_rate:    posTvaRate,
        pos_category_id: posCategoryId || null,
      }
      const url    = item ? `/api/stock-items/${item.id}` : '/api/stock-items'
      const method = item ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Erreur serveur') }
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
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--border)] p-6"
           style={{ background: 'var(--surface)' }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-[var(--text1)]">{item ? "Modifier l'article" : 'Nouvel article'}</h2>
            <p className="text-xs text-[var(--text3)] mt-0.5">Saisissez les informations de l&apos;article de stock</p>
          </div>
          <button onClick={onClose} className="text-lg text-[var(--text3)] hover:text-[var(--text1)] transition-colors cursor-pointer">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nom */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Nom de l&apos;article *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Pépites de chocolat"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
              style={{ background: 'var(--surface2)' }} />
          </div>

          {/* Catégorie + Fournisseur */}
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

          {/* Référence fournisseur */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Référence fournisseur</label>
            <input value={supplierRef} onChange={e => setSupplierRef(e.target.value)} placeholder="REF-001"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
              style={{ background: 'var(--surface2)' }} />
          </div>

          {/* Unité + Stock + Seuil */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Unité de base</label>
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
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Seuil alerte</label>
              <input type="number" step="0.001" value={alertThreshold} onChange={e => setAlertThreshold(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }} />
            </div>
          </div>

          {/* Calculatrice prix d'achat */}
          <div className="rounded-xl border border-[var(--border)] p-4 space-y-3" style={{ background: 'var(--bg)' }}>
            <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">
              Coût d&apos;achat
            </p>
            <p className="text-xs text-[var(--text3)]">
              Entrez le prix payé et la quantité achetée — le coût par {unit} sera calculé automatiquement.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-[10px] text-[var(--text4)] mb-1">Prix payé (€)</label>
                <div className="relative">
                  <input
                    type="number" step="0.01" value={purchaseTotal}
                    onChange={e => setPurchaseTotal(e.target.value)}
                    placeholder="40"
                    className="w-full px-2 py-1.5 pr-5 rounded-md border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                    style={{ background: 'var(--surface2)' }}
                  />
                  <span className="absolute right-2 top-2 text-xs text-[var(--text4)]">€</span>
                </div>
              </div>

              <span className="text-[var(--text4)] text-sm mt-4">÷</span>

              <div className="flex-1">
                <label className="block text-[10px] text-[var(--text4)] mb-1">Quantité achetée</label>
                <input
                  type="number" step="0.001" value={purchaseQty}
                  onChange={e => setPurchaseQty(e.target.value)}
                  placeholder="3.5"
                  className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                  style={{ background: 'var(--surface2)' }}
                />
              </div>

              <span className="text-[var(--text4)] text-xs mt-4">{unit}</span>

              <span className="text-[var(--text4)] text-sm mt-4">=</span>

              <div className="text-right mt-4 min-w-[80px]">
                {computedUnitPrice !== null ? (
                  <span className="text-sm font-semibold" style={{ color: 'var(--blue)' }}>
                    {computedUnitPrice.toFixed(4)} €/{unit}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text4)]">— €/{unit}</span>
                )}
              </div>
            </div>
          </div>

          {/* Coût unitaire + Qté à commander */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">
                Coût par {unit} (€)
              </label>
              <div className="relative">
                <input type="number" step="0.0001" value={unitPrice} onChange={e => setUnitPrice(e.target.value)}
                  className="w-full px-3 py-2 pr-14 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                  style={{ background: 'var(--surface2)' }} />
                <span className="absolute right-3 top-2.5 text-xs text-[var(--text4)]">€/{unit}</span>
              </div>
              {computedUnitPrice !== null && Math.abs(parseFloat(unitPrice) - computedUnitPrice) > 0.0001 && (
                <button
                  type="button" onClick={applyComputed}
                  className="mt-1 text-[10px] underline"
                  style={{ color: 'var(--blue)' }}
                >
                  ← Appliquer le calcul ({computedUnitPrice.toFixed(4)} €/{unit})
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Qté à commander</label>
              <input type="number" step="0.001" value={orderQuantity} onChange={e => setOrderQuantity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }} />
            </div>
          </div>

          {/* Vendu en caisse */}
          <div className="rounded-xl border border-[var(--border)] overflow-hidden" style={{ background: 'var(--bg)' }}>
            <button
              type="button"
              onClick={() => setIsPos(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <span className="text-sm font-semibold text-[var(--text1)]">Vendu en caisse</span>
                <span className="ml-2 text-xs text-[var(--text4)]">Produit prêt à vendre (Coca-Cola, Fanta…)</span>
              </div>
              <div className={`relative w-10 h-5 rounded-full transition-colors ${isPos ? 'bg-[var(--blue)]' : 'bg-[var(--border)]'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isPos ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </button>

            {isPos && (
              <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)]">
                <div className="grid grid-cols-2 gap-3 pt-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Prix de vente TTC (€) *</label>
                    <div className="relative">
                      <input
                        type="number" step="0.01" value={posPrice}
                        onChange={e => setPosPrice(e.target.value)}
                        placeholder="2.50"
                        className="w-full px-3 py-2 pr-7 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                        style={{ background: 'var(--surface2)' }}
                      />
                      <span className="absolute right-2.5 top-2 text-xs text-[var(--text4)]">€</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">TVA</label>
                    <select
                      value={posTvaRate} onChange={e => setPosTvaRate(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                      style={{ background: 'var(--surface2)' }}
                    >
                      {TVA_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Catégorie caisse</label>
                  <select
                    value={posCategoryId} onChange={e => setPosCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                    style={{ background: 'var(--surface2)' }}
                  >
                    <option value="">— Aucune catégorie —</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {posPrice && (
                  <p className="text-xs text-[var(--text4)]">
                    {(() => {
                      const priceHT = parseFloat(posPrice) / (1 + posTvaRate / 100)
                      const cost    = parseFloat(unitPrice) || 0
                      const margin  = cost > 0 ? ((priceHT - cost) / priceHT * 100).toFixed(1) : '—'
                      return `Prix HT : ${priceHT.toFixed(2)} € · Marge brute : ${margin}${cost > 0 ? '%' : ''}`
                    })()}
                  </p>
                )}
              </div>
            )}
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
