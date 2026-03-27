'use client'

import { useState, useEffect } from 'react'
import { StatusToggle } from '@/components/ui/status-toggle'
import type { Product, Category } from './types'

const TVA_RATES = [5.5, 10, 20] as const
const EMOJI_SUGGESTIONS = ['☕', '🍪', '🥐', '🧁', '🍰', '🥤', '🧃', '🍫', '🫖', '🥛', '🧋', '🎁']

interface ProductFormProps {
  open: boolean
  product: Product | null
  categories: Category[]
  onClose: () => void
  onSave: (data: Omit<Product, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'sort_order' | 'establishment_id' | 'category'>) => Promise<void>
}

export function ProductForm({ open, product, categories, onClose, onSave }: ProductFormProps) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [tvaRate, setTvaRate] = useState<5.5 | 10 | 20>(10)
  const [categoryId, setCategoryId] = useState<string>('')
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prix HT calculé
  const priceTtc = parseFloat(price) || 0
  const priceHt = tvaRate > 0 ? (priceTtc / (1 + tvaRate / 100)).toFixed(2) : price

  useEffect(() => {
    if (open) {
      setName(product?.name ?? '')
      setEmoji(product?.emoji ?? '')
      setDescription(product?.description ?? '')
      setPrice(product?.price?.toFixed(2) ?? '')
      setTvaRate(product?.tva_rate ?? 10)
      setCategoryId(product?.category_id ?? '')
      setIsActive(product?.is_active ?? true)
      setError(null)
    }
  }, [open, product])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Le nom est requis'); return }
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) < 0) { setError('Prix invalide'); return }

    setLoading(true)
    setError(null)
    try {
      await onSave({
        name: name.trim(),
        emoji: emoji.trim() || null,
        description: description.trim() || null,
        price: priceTtc,
        tva_rate: tvaRate,
        category_id: categoryId || null,
        is_active: isActive,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde')
    } finally {
      setLoading(false)
    }
  }

  const isEdit = Boolean(product)

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 overflow-y-auto"
      style={{ background: 'var(--overlay-bg)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--border)] mb-4"
        style={{ background: 'var(--surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text1)]">
              {isEdit ? 'Modifier le produit' : 'Nouveau produit'}
            </h2>
            <p className="text-xs text-[var(--text3)] mt-0.5">
              {isEdit ? 'Modifiez les informations du produit' : 'Ajoutez un produit à votre catalogue'}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text3)] hover:text-[var(--text1)] transition-colors text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Emoji + Nom */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Nom du produit *</label>
            <div className="flex gap-2">
              <div className="relative">
                <input
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                  placeholder="☕"
                  maxLength={2}
                  className="w-12 h-10 text-center text-lg rounded-lg border border-[var(--border)] focus:outline-none focus:border-[var(--blue)]"
                  style={{ background: 'var(--surface2)' }}
                />
              </div>
              <input
                data-testid="product-name-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Latte Vanille, Cookie Choco..."
                className="flex-1 h-10 px-3 rounded-lg text-sm border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)]"
                style={{ background: 'var(--surface2)' }}
                required
              />
            </div>
            {/* Suggestions emoji */}
            <div className="flex gap-1 mt-1.5 flex-wrap">
              {EMOJI_SUGGESTIONS.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className="w-7 h-7 rounded text-base hover:bg-[var(--surface2)] transition-colors"
                  title={e}
                >{e}</button>
              ))}
            </div>
          </div>

          {/* Catégorie */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Catégorie</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg text-sm border border-[var(--border)] text-[var(--text2)] focus:outline-none focus:border-[var(--blue)]"
              style={{ background: 'var(--surface2)' }}
            >
              <option value="">Sélectionner...</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description courte (optionnel)..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg text-sm border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)] resize-none"
              style={{ background: 'var(--surface2)' }}
            />
          </div>

          {/* Prix + TVA */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Prix TTC (€) *</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                data-testid="product-price-input"
                className="w-full h-10 px-3 rounded-lg text-sm border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)]"
                style={{ background: 'var(--surface2)' }}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Taux TVA *</label>
              <select
                value={tvaRate}
                onChange={(e) => setTvaRate(parseFloat(e.target.value) as 5.5 | 10 | 20)}
                className="w-full h-10 px-3 rounded-lg text-sm border border-[var(--border)] text-[var(--text2)] focus:outline-none focus:border-[var(--blue)]"
                style={{ background: 'var(--surface2)' }}
              >
                <option value={5.5}>TVA 5,5% — Restauration sur place</option>
                <option value={10}>TVA 10% — Vente à emporter</option>
                <option value={20}>TVA 20% — Alcool & Merch</option>
              </select>
            </div>
          </div>

          {/* Prix HT calculé */}
          {priceTtc > 0 && (
            <div
              className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
              style={{ background: 'var(--row-edit-bg)', border: '1px solid rgba(29,78,216,0.2)' }}
            >
              <span className="text-[var(--text3)]">Prix HT calculé</span>
              <span className="font-semibold text-[var(--text1)]">{priceHt} € HT</span>
            </div>
          )}

          {/* Produit actif */}
          <div className="flex items-center justify-between py-2 border-t border-[var(--border)]">
            <div>
              <div className="text-sm font-medium text-[var(--text1)]">Produit actif</div>
              <div className="text-xs text-[var(--text3)]">Visible et disponible à la caisse</div>
            </div>
            <div data-testid="product-active-toggle">
              <StatusToggle active={isActive} onChange={setIsActive} />
            </div>
          </div>

          {/* Erreur */}
          {error && (
            <div
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)' }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg text-sm text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
              style={{ background: 'var(--surface)' }}
            >
              Annuler
            </button>
            <button
              data-testid="product-submit-btn"
              type="submit"
              disabled={loading}
              className="h-9 px-4 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--blue)' }}
            >
              {loading ? 'Enregistrement...' : isEdit ? '💾 Enregistrer les modifications' : 'Enregistrer le produit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
