// src/app/dashboard/recettes/_components/recipe-form.tsx
'use client'
import { useState, useEffect } from 'react'
import { FoodCostIndicator } from './food-cost-indicator'
import type { Recipe, RecipeIngredient } from './types'

interface Category { id: string; name: string; color_hex: string; icon: string | null }

interface IngredientLine {
  id?: string
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

const UNITS = ['kg', 'g', 'L', 'cL', 'mL', 'u.', 'pièce', 'boîte', 'sac']
const TVA_OPTIONS = [{ value: 5.5, label: '5,5%' }, { value: 10, label: '10%' }, { value: 20, label: '20%' }]

function toLine(i: RecipeIngredient): IngredientLine {
  return { id: i.id, name: i.name, quantity: String(i.quantity), unit: i.unit, unit_cost: String(i.unit_cost) }
}

export function RecipeForm({ open, recipe, categories, onClose, onSave }: Props) {
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState('')
  const [portion,     setPortion]     = useState('')
  const [isInternal,  setIsInternal]  = useState(true)
  const [posPrice,    setPosPrice]    = useState('')
  const [posTva,      setPosTva]      = useState(10)
  const [posCatId,    setPosCatId]    = useState('')
  const [ingredients, setIngredients] = useState<IngredientLine[]>([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle(recipe?.title ?? '')
      setDescription(recipe?.description ?? '')
      setCategory(recipe?.category ?? '')
      setPortion(recipe?.portion ?? '')
      setIsInternal(recipe?.is_internal ?? true)
      setPosPrice(recipe?.product?.[0] ? String(recipe.product[0].price) : '')
      setPosTva(recipe?.product?.[0]?.tva_rate ?? 10)
      setPosCatId(recipe?.product?.[0]?.category_id ?? '')
      setIngredients(recipe?.ingredients?.map(toLine) ?? [])
      setError(null)
    }
  }, [open, recipe])

  if (!open) return null

  // Live food cost calculation
  const foodCostAmount = ingredients.reduce((sum, ing) => {
    const qty  = parseFloat(ing.quantity)  || 0
    const cost = parseFloat(ing.unit_cost) || 0
    return sum + qty * cost
  }, 0)
  const priceNum = parseFloat(posPrice) || 0
  const foodCostPct = !isInternal && priceNum > 0
    ? Math.round((foodCostAmount / priceNum) * 1000) / 10
    : null

  function addIngredient() {
    setIngredients(prev => [...prev, { name: '', quantity: '1', unit: 'kg', unit_cost: '0' }])
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
        title: title.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        portion: portion.trim() || null,
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
          pos: {
            price:       parseFloat(posPrice),
            tva_rate:    posTva,
            category_id: posCatId || null,
          }
        } : {}),
      }

      const url    = recipe ? `/api/recipes/${recipe.id}` : '/api/recipes'
      const method = recipe ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border)] p-6" style={{ background: 'var(--surface)' }}>
        <h2 className="text-base font-bold text-[var(--text1)] mb-5">
          {recipe ? 'Modifier la recette' : 'Nouvelle recette'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Informations générales */}
          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Nom de la recette *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Cookie chocolat"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Catégorie recette</label>
              <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Pâtisserie, Boisson..."
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
            </div>
            <div>
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Portion</label>
              <input value={portion} onChange={e => setPortion(e.target.value)} placeholder="8 portions"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-sm resize-none" />
          </div>

          {/* Ingrédients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Ingrédients</label>
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
            <div className="space-y-2">
              {ingredients.map((ing, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_80px_80px_28px] gap-1.5 items-center">
                  <input value={ing.name} onChange={e => updateIngredient(idx, 'name', e.target.value)}
                    placeholder="Farine T55"
                    className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-xs" />
                  <input type="number" step="0.001" value={ing.quantity} onChange={e => updateIngredient(idx, 'quantity', e.target.value)}
                    placeholder="Qté"
                    className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-xs text-right" />
                  <select value={ing.unit} onChange={e => updateIngredient(idx, 'unit', e.target.value)}
                    className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-xs">
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                  <input type="number" step="0.001" value={ing.unit_cost} onChange={e => updateIngredient(idx, 'unit_cost', e.target.value)}
                    placeholder="0,00 €"
                    className="px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text1)] text-xs text-right" />
                  <button type="button" onClick={() => removeIngredient(idx)}
                    className="text-red-500/60 hover:text-red-400 text-sm font-bold text-center">×</button>
                </div>
              ))}
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
                className={`relative w-11 h-6 rounded-full transition-colors ${!isInternal ? '' : 'bg-[var(--border)]'}`}
                style={{ background: !isInternal ? 'var(--blue)' : undefined }}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${!isInternal ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {!isInternal && (
              <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Prix de vente TTC *</label>
                    <div className="relative mt-1">
                      <input type="number" step="0.01" value={posPrice} onChange={e => setPosPrice(e.target.value)}
                        placeholder="4,50"
                        className="w-full px-3 py-2 pr-7 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-sm" />
                      <span className="absolute right-3 top-2.5 text-xs text-[var(--text4)]">€</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">TVA</label>
                    <select value={posTva} onChange={e => setPosTva(parseFloat(e.target.value))}
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-sm">
                      {TVA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Catégorie caisse</label>
                  <select value={posCatId} onChange={e => setPosCatId(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text1)] text-sm">
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

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text3)]">Annuler</button>
            <button type="submit" disabled={loading}
              className="flex-2 px-6 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--blue)' }}>
              {loading ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
