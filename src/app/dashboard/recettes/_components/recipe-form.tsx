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
  unit: string          // unit used in THIS recipe (e.g. 'g')
  unit_cost: string     // €/recipe_unit — auto-computed, editable
  _stock_unit: string        // base unit of the stock item (not saved)
  _stock_unit_price: number  // stock item's price per stock unit (not saved)
}

interface Props {
  open: boolean
  recipe: Recipe | null
  categories: Category[]
  onClose: () => void
  onSave: () => Promise<void>
}

const TVA_OPTIONS = [{ value: 5.5, label: '5,5%' }, { value: 10, label: '10%' }, { value: 20, label: '20%' }]

// Unit conversion tables
const WEIGHT_TO_G: Record<string, number> = { g: 1, kg: 1000 }
const VOLUME_TO_ML: Record<string, number> = { mL: 1, cL: 10, L: 1000 }

/** Returns units compatible (convertible) with stockUnit */
function compatibleUnits(stockUnit: string): string[] {
  if (stockUnit in WEIGHT_TO_G) return Object.keys(WEIGHT_TO_G)   // ['g', 'kg']
  if (stockUnit in VOLUME_TO_ML) return Object.keys(VOLUME_TO_ML) // ['mL', 'cL', 'L']
  return [stockUnit]
}

/** Cost per 1 recipeUnit, given stockUnitPrice per 1 stockUnit */
function costPerUnit(stockUnitPrice: number, stockUnit: string, recipeUnit: string): number {
  if (!stockUnitPrice || stockUnit === recipeUnit) return stockUnitPrice
  if (WEIGHT_TO_G[stockUnit] !== undefined && WEIGHT_TO_G[recipeUnit] !== undefined) {
    return stockUnitPrice * WEIGHT_TO_G[recipeUnit] / WEIGHT_TO_G[stockUnit]
  }
  if (VOLUME_TO_ML[stockUnit] !== undefined && VOLUME_TO_ML[recipeUnit] !== undefined) {
    return stockUnitPrice * VOLUME_TO_ML[recipeUnit] / VOLUME_TO_ML[stockUnit]
  }
  return stockUnitPrice
}

function toLine(i: RecipeIngredient): IngredientLine {
  return {
    id: i.id,
    stock_item_id: '',
    name: i.name,
    quantity: String(i.quantity),
    unit: i.unit,
    unit_cost: String(i.unit_cost),
    _stock_unit: i.unit,
    _stock_unit_price: i.unit_cost,
  }
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
        if (!match) return ing
        return {
          ...ing,
          stock_item_id: match.id,
          _stock_unit: match.unit,
          _stock_unit_price: match.unit_price,
          // Only update unit_cost if it seems wrong (0 or default)
          unit_cost: ing.unit_cost !== '0' ? ing.unit_cost : String(costPerUnit(match.unit_price, match.unit, ing.unit)),
        }
      }))

      // Distinct recipe categories for combobox
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
    setIngredients(prev => [...prev, {
      stock_item_id: '', name: '', quantity: '1',
      unit: 'g', unit_cost: '0',
      _stock_unit: 'g', _stock_unit_price: 0,
    }])
  }

  function selectStockItem(idx: number, stockItemId: string) {
    const item = stockItems.find(s => s.id === stockItemId)
    if (!item) {
      setIngredients(prev => prev.map((ing, i) => i === idx
        ? { ...ing, stock_item_id: '', name: '', unit: 'g', unit_cost: '0', _stock_unit: 'g', _stock_unit_price: 0 }
        : ing))
      return
    }
    setIngredients(prev => prev.map((ing, i) => i === idx
      ? {
          ...ing,
          stock_item_id:     item.id,
          name:              item.name,
          unit:              item.unit,
          unit_cost:         String(item.unit_price),
          _stock_unit:       item.unit,
          _stock_unit_price: item.unit_price,
        }
      : ing))
  }

  function changeIngredientUnit(idx: number, newUnit: string) {
    setIngredients(prev => prev.map((ing, i) => {
      if (i !== idx) return ing
      const newCost = costPerUnit(ing._stock_unit_price, ing._stock_unit, newUnit)
      return { ...ing, unit: newUnit, unit_cost: String(newCost) }
    }))
  }

  function updateIngredient(idx: number, field: 'quantity' | 'unit_cost', value: string) {
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
        const msg = typeof j.error === 'string'
          ? j.error
          : j.error?.formErrors?.[0] ?? JSON.stringify(j.error) ?? 'Erreur serveur'
        throw new Error(msg)
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
              <div>
                <label className="block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Ingrédients</label>
                <p className="text-[10px] text-[var(--text4)] mt-0.5">
                  Sélectionnez depuis l&apos;inventaire — l&apos;unité et le coût sont convertis automatiquement
                </p>
              </div>
              <button type="button" onClick={addIngredient}
                className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--blue)' }}>
                + Ajouter
              </button>
            </div>

            {ingredients.length === 0 && (
              <p className="text-xs text-[var(--text4)] text-center py-3 border border-dashed border-[var(--border)] rounded-lg">
                Aucun ingrédient — cliquez sur + Ajouter
              </p>
            )}

            <div className="space-y-2">
              {ingredients.map((ing, idx) => {
                const qty      = parseFloat(ing.quantity) || 0
                const cost     = parseFloat(ing.unit_cost) || 0
                const lineCost = qty * cost
                const units    = ing.stock_item_id ? compatibleUnits(ing._stock_unit) : ['g', 'kg', 'mL', 'cL', 'L', 'u.']

                return (
                  <div key={idx} className="rounded-xl border border-[var(--border)] p-3 space-y-2"
                       style={{ background: 'var(--bg)' }}>
                    {/* Row 1: stock item selector + remove */}
                    <div className="flex items-center gap-2">
                      <select
                        value={ing.stock_item_id}
                        onChange={e => selectStockItem(idx, e.target.value)}
                        className="flex-1 px-2 py-1.5 rounded-md border border-[var(--border)] text-[var(--text1)] text-xs focus:outline-none focus:border-[var(--blue)] transition-colors"
                        style={{ background: 'var(--surface2)' }}
                      >
                        <option value="">— Choisir dans l&apos;inventaire —</option>
                        {stockItems.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.unit} · {s.unit_price > 0 ? `${s.unit_price.toFixed(4)} €/${s.unit}` : 'coût non défini'})
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => removeIngredient(idx)}
                        className="text-red-500/60 hover:text-red-400 text-base font-bold flex-shrink-0">×</button>
                    </div>

                    {/* Row 2: quantity + unit + computed cost */}
                    <div className="grid grid-cols-[80px_80px_1fr_auto] gap-2 items-end">
                      <div>
                        <label className="block text-[10px] text-[var(--text4)] mb-1">Quantité</label>
                        <input
                          type="number" step="0.001" value={ing.quantity}
                          onChange={e => updateIngredient(idx, 'quantity', e.target.value)}
                          placeholder="20"
                          className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] text-[var(--text1)] text-xs text-right focus:outline-none focus:border-[var(--blue)] transition-colors"
                          style={{ background: 'var(--surface2)' }}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] text-[var(--text4)] mb-1">Unité</label>
                        <select
                          value={ing.unit}
                          onChange={e => changeIngredientUnit(idx, e.target.value)}
                          className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] text-[var(--text1)] text-xs focus:outline-none focus:border-[var(--blue)] transition-colors"
                          style={{ background: 'var(--surface2)' }}
                        >
                          {units.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-[var(--text4)] mb-1">
                          Coût/{ing.unit} (€)
                          {ing.stock_item_id && ing._stock_unit !== ing.unit && (
                            <span className="ml-1 text-[var(--blue)]">converti</span>
                          )}
                        </label>
                        <input
                          type="number" step="0.00001" value={ing.unit_cost}
                          onChange={e => updateIngredient(idx, 'unit_cost', e.target.value)}
                          className="w-full px-2 py-1.5 rounded-md border border-[var(--border)] text-[var(--text1)] text-xs text-right focus:outline-none focus:border-[var(--blue)] transition-colors"
                          style={{ background: 'var(--surface2)' }}
                        />
                      </div>

                      {/* Line cost */}
                      <div className="text-right pb-1.5">
                        {lineCost > 0 ? (
                          <span className="text-sm font-semibold" style={{ color: 'var(--blue)' }}>
                            {lineCost.toFixed(3)} €
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--text4)]">— €</span>
                        )}
                      </div>
                    </div>

                    {/* Legacy ingredient warning */}
                    {!ing.stock_item_id && ing.name && (
                      <p className="text-[10px] text-amber-400/70">
                        ⚠ &quot;{ing.name}&quot; — non lié à l&apos;inventaire. Sélectionnez un article ci-dessus.
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
