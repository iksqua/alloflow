// src/app/dashboard/recettes/_components/recipe-form.tsx
'use client'
import { useState, useEffect } from 'react'
import { FoodCostIndicator } from './food-cost-indicator'
import type { Recipe, RecipeIngredient } from './types'

interface Category { id: string; name: string; color_hex: string; icon: string | null }

interface StockItem {
  id: string
  name: string
  unit: string
  unit_price: number
}

interface IngredientLine {
  id?: string
  stock_item_id: string
  name: string
  quantity: string
  unit: string
  unit_cost: string
}

interface Props {
  open: boolean
  recipe: Recipe | null
  categories: Category[]
  onClose: () => void
  onSave: () => Promise<void>
}

const TVA_OPTIONS = [{ value: 5.5, label: '5,5%' }, { value: 10, label: '10%' }, { value: 20, label: '20%' }]

function toLine(i: RecipeIngredient): IngredientLine {
  return { id: i.id, stock_item_id: '', name: i.name, quantity: String(i.quantity), unit: i.unit, unit_cost: String(i.unit_cost) }
}

export function RecipeForm({ open, recipe, categories, onClose, onSave }: Props) {
  const [title,            setTitle]            = useState('')
  const [description,      setDescription]      = useState('')
  const [category,         setCategory]         = useState('')
  const [portion,          setPortion]          = useState('')
  const [isInternal,       setIsInternal]       = useState(true)
  const [posPrice,         setPosPrice]         = useState('')
  const [posTva,           setPosTva]           = useState(10)
  const [posCatId,         setPosCatId]         = useState('')
  const [ingredients,      setIngredients]      = useState<IngredientLine[]>([])
  const [stockItems,       setStockItems]       = useState<StockItem[]>([])
  const [recipeCategories, setRecipeCategories] = useState<string[]>([])
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const lines = recipe?.ingredients?.map(toLine) ?? []
    setTitle(recipe?.title ?? '')
    setDescription(recipe?.description ?? '')
    setCategory(recipe?.category ?? '')
    setPortion(recipe?.portion ?? '')
    setIsInternal(recipe?.is_internal ?? true)
    setPosPrice(recipe?.product?.[0] ? String(recipe.product[0].price) : '')
    setPosTva(recipe?.product?.[0]?.tva_rate ?? 10)
    setPosCatId(recipe?.product?.[0]?.category_id ?? '')
    setIngredients(lines)
    setError(null)

    Promise.all([
      fetch('/api/stock-items').then(r => r.json()),
      fetch('/api/recipes').then(r => r.json()),
    ]).then(([stockJson, recipesJson]) => {
      const items: StockItem[] = stockJson.items ?? []
      setStockItems(items)

      // Auto-match existing ingredient names to stock items
      setIngredients(prev => prev.map(ing => {
        if (ing.stock_item_id) return ing
        const match = items.find(s => s.name.toLowerCase() === ing.name.toLowerCase())
        return match ? { ...ing, stock_item_id: match.id, unit: match.unit, unit_cost: String(match.unit_price) } : ing
      }))

      // Distinct recipe categories for the combobox
      const cats = (recipesJson.recipes ?? [])
        .map((r: { category: string | null }) => r.category)
        .filter((c: string | null): c is string => !!c)
      setRecipeCategories([...new Set(cats as string[])])
    }).catch(() => { /* non-blocking */ })
  }, [open, recipe])

  if (!open) return null

  // Live food cost
  const foodCostAmount = ingredients.reduce((sum, ing) =>
    sum + (parseFloat(ing.quantity) || 0) * (parseFloat(ing.unit_cost) || 0), 0)
  const priceNum = parseFloat(posPrice) || 0
  const foodCostPct = !isInternal && priceNum > 0
    ? Math.round((foodCostAmount / priceNum) * 1000) / 10
    : null

  function addIngredient() {
    setIngredients(prev => [...prev, { stock_item_id: '', name: '', quantity: '1', unit: 'kg', unit_cost: '0' }])
  }

  function selectStockItem(idx: number, stockItemId: string) {
    const item = stockItems.find(s => s.id === stockItemId)
    if (!item) {
      setIngredients(prev => prev.map((ing, i) => i === idx
        ? { ...ing, stock_item_id: '', name: '', unit: 'kg', unit_cost: '0' }
        : ing))
      return
    }
    setIngredients(prev => prev.map((ing, i) => i === idx
      ? { ...ing, stock_item_id: item.id, name: item.name, unit: item.unit, unit_cost: String(item.unit_price) }
      : ing))
  }

  function updateIngredient(idx: number, field: keyof IngredientLine, value: string) {
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing))
  }

  function removeIngredient(idx: number) {
    setIngredients(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Le nom est requis'); return }
    if (!isInternal && !posPrice) { setError('Le prix de vente est requis'); return }

    setLoading(true); setError(null)
    try {
      const payload = {
        title:       title.trim(),
        description: description.trim() || null,
        category:    category.trim() || null,
        portion:     portion.trim() || null,
        is_internal: isInternal,
        ingredients: ingredients
          .filter(ing => ing.name.trim())
          .map((ing, idx) => ({
            ...(ing.id ? { id: ing.id } : {}),
            name:       ing.name.trim(),
            quantity:   parseFloat(ing.quantity) || 0,
            unit:       ing.unit,
            unit_cost:  parseFloat(ing.unit_cost) || 0,
            sort_order: idx,
          })),
        ...(!isInternal ? {
          pos: { price: parseFloat(posPrice), tva_rate: posTva, category_id: posCatId || null }
        } : {}),
      }

      const url    = recipe ? `/api/recipes/${recipe.id}` : '/api/recipes'
      const method = recipe ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Erreur serveur')
      }
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
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--border)] p-6"
           style={{ background: 'var(--surface)' }}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-[var(--text1)]">
              {recipe ? 'Modifier la recette' : 'Nouvelle recette'}
            </h2>
            <p className="text-xs text-[var(--text3)] mt-0.5">Saisissez les informations de la recette</p>
          </div>
          <button onClick={onClose} className="text-lg text-[var(--text3)] hover:text-[var(--text1)] transition-colors cursor-pointer">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Informations générales */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Nom de la recette *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Cookie chocolat"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text1)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
              style={{ background: 'var(--surface2)' }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Catégorie recette</label>
              {/* Native combobox: free text + suggestions from existing categories */}
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                list="recipe-cat-list"
                placeholder="Pâtisserie, Boisson..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text1)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }}
              />
              <datalist id="recipe-cat-list">
                {recipeCategories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Portion</label>
              <input value={portion} onChange={e => setPortion(e.target.value)} placeholder="8 portions"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text1)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                style={{ background: 'var(--surface2)' }} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text1)] text-sm resize-none focus:outline-none focus:border-[var(--blue)] transition-colors"
              style={{ background: 'var(--surface2)' }} />
          </div>

          {/* Ingrédients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Ingrédients</label>
              <button type="button" onClick={addIngredient}
                className="text-xs font-semibold" style={{ color: 'var(--blue)' }}>
                + Ajouter
              </button>
            </div>

            {ingredients.length === 0 && (
              <p className="text-xs text-[var(--text4)] text-center py-3 border border-dashed border-[var(--border)] rounded-lg">
                Aucun ingrédient — cliquez sur + Ajouter
              </p>
            )}

            {ingredients.length > 0 && (
              <div className="grid grid-cols-[1fr_68px_60px_68px_68px_20px] gap-1.5 px-1 mb-1">
                <span className="text-[10px] text-[var(--text4)]">Ingrédient (inventaire)</span>
                <span className="text-[10px] text-[var(--text4)] text-right">Quantité</span>
                <span className="text-[10px] text-[var(--text4)]">Unité</span>
                <span className="text-[10px] text-[var(--text4)] text-right">Coût/u.</span>
                <span className="text-[10px] text-[var(--text4)] text-right">Sous-total</span>
                <span />
              </div>
            )}

            <div className="space-y-1.5">
              {ingredients.map((ing, idx) => {
                const lineCost = (parseFloat(ing.quantity) || 0) * (parseFloat(ing.unit_cost) || 0)
                return (
                  <div key={idx} className="space-y-0.5">
                    <div className="grid grid-cols-[1fr_68px_60px_68px_68px_20px] gap-1.5 items-center">
                      {/* Stock item selector */}
                      <select
                        value={ing.stock_item_id}
                        onChange={e => selectStockItem(idx, e.target.value)}
                        className="px-2 py-1.5 rounded-md border border-[var(--border)] text-[var(--text1)] text-xs focus:outline-none focus:border-[var(--blue)] transition-colors"
                        style={{ background: 'var(--surface2)' }}
                      >
                        <option value="">— Choisir —</option>
                        {stockItems.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>

                      {/* Quantity */}
                      <input type="number" step="0.001" value={ing.quantity}
                        onChange={e => updateIngredient(idx, 'quantity', e.target.value)}
                        placeholder="Qté"
                        className="px-2 py-1.5 rounded-md border border-[var(--border)] text-[var(--text1)] text-xs text-right focus:outline-none focus:border-[var(--blue)] transition-colors"
                        style={{ background: 'var(--surface2)' }} />

                      {/* Unit — auto-filled but editable */}
                      <input value={ing.unit}
                        onChange={e => updateIngredient(idx, 'unit', e.target.value)}
                        className="px-2 py-1.5 rounded-md border border-[var(--border)] text-[var(--text1)] text-xs focus:outline-none focus:border-[var(--blue)] transition-colors"
                        style={{ background: 'var(--surface2)' }} />

                      {/* Unit cost — auto-filled but editable */}
                      <input type="number" step="0.0001" value={ing.unit_cost}
                        onChange={e => updateIngredient(idx, 'unit_cost', e.target.value)}
                        placeholder="0.00"
                        className="px-2 py-1.5 rounded-md border border-[var(--border)] text-[var(--text1)] text-xs text-right focus:outline-none focus:border-[var(--blue)] transition-colors"
                        style={{ background: 'var(--surface2)' }} />

                      {/* Per-line food cost */}
                      <span className="text-xs text-right text-[var(--text3)] whitespace-nowrap">
                        {lineCost > 0 ? `${lineCost.toFixed(3)} €` : '—'}
                      </span>

                      <button type="button" onClick={() => removeIngredient(idx)}
                        className="text-red-500/60 hover:text-red-400 text-sm font-bold text-center">×</button>
                    </div>

                    {/* Show legacy name when no stock item matched */}
                    {!ing.stock_item_id && ing.name && (
                      <p className="text-[10px] text-amber-400/70 pl-2">
                        ⚠ Nom actuel : {ing.name} — sélectionnez un article de l&apos;inventaire pour le lier
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {ingredients.length > 0 && (
              <div className="mt-3 p-3 rounded-lg border border-[var(--border)]" style={{ background: 'var(--bg)' }}>
                <FoodCostIndicator amount={foodCostAmount} pct={foodCostPct} />
              </div>
            )}
          </div>

          {/* POS Toggle */}
          <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: 'var(--bg)' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--text1)]">🧾 Vendu en caisse (POS)</p>
                <p className="text-xs text-[var(--text4)] mt-0.5">Expose ce plat dans la caisse enregistreuse</p>
              </div>
              <button
                type="button"
                onClick={() => setIsInternal(v => !v)}
                className="relative w-11 h-6 rounded-full transition-colors"
                style={{ background: !isInternal ? 'var(--blue)' : 'var(--border)' }}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${!isInternal ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {!isInternal && (
              <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Prix de vente TTC *</label>
                    <div className="relative">
                      <input type="number" step="0.01" value={posPrice} onChange={e => setPosPrice(e.target.value)}
                        placeholder="4,50"
                        className="w-full px-3 py-2 pr-7 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                        style={{ background: 'var(--surface2)' }} />
                      <span className="absolute right-3 top-2.5 text-xs text-[var(--text4)]">€</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">TVA</label>
                    <select value={posTva} onChange={e => setPosTva(parseFloat(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                      style={{ background: 'var(--surface2)' }}>
                      {TVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5">Catégorie caisse</label>
                  <select value={posCatId} onChange={e => setPosCatId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text2)] text-sm focus:outline-none focus:border-[var(--blue)] transition-colors"
                    style={{ background: 'var(--surface2)' }}>
                    <option value="">— Aucune catégorie —</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
                {posPrice && (
                  <div className="p-3 rounded-lg border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
                    <FoodCostIndicator amount={foodCostAmount} pct={foodCostPct} />
                  </div>
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
