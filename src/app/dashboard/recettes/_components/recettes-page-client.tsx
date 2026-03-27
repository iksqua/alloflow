// src/app/dashboard/recettes/_components/recettes-page-client.tsx
'use client'
import { useState, useMemo } from 'react'
import { RecipeForm } from './recipe-form'
import type { Recipe } from './types'

interface Category { id: string; name: string; color_hex: string; icon: string | null }

interface Props {
  initialRecipes: Recipe[]
  categories: Category[]
}

type SortKey = 'food_cost_desc' | 'food_cost_asc' | 'margin_desc' | 'name'

function fcColor(pct: number | null): string {
  if (pct === null) return 'var(--text4)'
  if (pct < 30) return '#10b981'
  if (pct < 35) return '#f59e0b'
  return '#ef4444'
}

function fcBarColor(pct: number | null): string {
  if (pct === null) return 'var(--border)'
  if (pct < 30) return '#10b981'
  if (pct < 35) return '#f59e0b'
  return '#ef4444'
}

export function RecettesPageClient({ initialRecipes, categories }: Props) {
  const [recipes, setRecipes]           = useState(initialRecipes)
  const [showForm, setShowForm]         = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [catFilter, setCatFilter]       = useState('')
  const [sort, setSort]                 = useState<SortKey>('food_cost_desc')

  // Unique recipe categories for the dropdown
  const recipeCategories = useMemo(
    () => [...new Set(recipes.map(r => r.category).filter(Boolean) as string[])],
    [recipes]
  )

  const filtered = useMemo(() => {
    const list = catFilter ? recipes.filter(r => r.category === catFilter) : recipes
    switch (sort) {
      case 'food_cost_asc':  return [...list].sort((a, b) => (a.food_cost_pct ?? 0) - (b.food_cost_pct ?? 0))
      case 'food_cost_desc': return [...list].sort((a, b) => (b.food_cost_pct ?? 0) - (a.food_cost_pct ?? 0))
      case 'margin_desc':    return [...list].sort((a, b) => (a.food_cost_pct ?? 100) - (b.food_cost_pct ?? 100))
      case 'name':           return [...list].sort((a, b) => a.title.localeCompare(b.title))
    }
  }, [recipes, catFilter, sort])

  // Stats (only POS recipes with a known food cost)
  const posWithCost = recipes.filter(r => !r.is_internal && r.food_cost_pct !== null)
  const avgFoodCost = posWithCost.length > 0
    ? posWithCost.reduce((s, r) => s + (r.food_cost_pct ?? 0), 0) / posWithCost.length
    : null
  const avgMargin   = avgFoodCost !== null ? 100 - avgFoodCost : null
  const alertCount  = recipes.filter(r => (r.food_cost_pct ?? 0) > 35).length

  async function reload() {
    const res   = await fetch('/api/recipes')
    const json  = await res.json()
    const fresh: Recipe[] = json.recipes ?? []
    setRecipes(fresh)
    // Keep editingRecipe in sync so the form always shows fresh data
    setEditingRecipe(prev => {
      if (!prev) return prev
      return fresh.find(r => r.id === prev.id) ?? prev
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette recette ?')) return
    await fetch(`/api/recipes/${id}`, { method: 'DELETE' })
    await reload()
  }

  function openNew() { setEditingRecipe(null); setShowForm(true) }

  return (
    <div className="max-w-6xl mx-auto p-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text1)]">Recettes &amp; Food Cost</h1>
          <p className="text-xs text-[var(--text4)] mt-0.5">
            {recipes.filter(r => !r.is_internal).length} vendues en caisse
            · {recipes.filter(r => r.is_internal).length} internes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-[var(--border)] text-[var(--text3)] text-xs focus:outline-none focus:border-[var(--blue)]"
            style={{ background: 'var(--surface2)' }}
          >
            <option value="">Toutes catégories</option>
            {recipeCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="h-9 px-3 rounded-lg border border-[var(--border)] text-[var(--text3)] text-xs focus:outline-none focus:border-[var(--blue)]"
            style={{ background: 'var(--surface2)' }}
          >
            <option value="food_cost_desc">Trier : Food cost ↓</option>
            <option value="food_cost_asc">Trier : Food cost ↑</option>
            <option value="margin_desc">Trier : Marge ↓</option>
            <option value="name">Trier : Nom</option>
          </select>
          <button
            onClick={openNew}
            className="h-9 px-4 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--blue)' }}
          >
            + Nouvelle recette
          </button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: 'var(--surface)' }}>
          <div className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-2">Food cost moyen</div>
          <div className="text-3xl font-black mb-1" style={{ color: avgFoodCost !== null ? fcColor(avgFoodCost) : 'var(--text4)' }}>
            {avgFoodCost !== null ? `${avgFoodCost.toFixed(1)}%` : '—'}
          </div>
          <div className="text-xs text-[var(--text4)]">Cible : &lt; 30%</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: 'var(--surface)' }}>
          <div className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-2">Marge brute moy.</div>
          <div className="text-3xl font-black text-green-400 mb-1">
            {avgMargin !== null ? `${avgMargin.toFixed(1)}%` : '—'}
          </div>
          <div className="text-xs text-[var(--text4)]">Sur recettes POS</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: 'var(--surface)' }}>
          <div className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-2">Recettes fiches</div>
          <div className="text-3xl font-black text-[var(--text1)] mb-1">{recipes.length}</div>
          <div className="text-xs text-[var(--text4)]">{recipes.filter(r => !r.is_internal).length} vendues en caisse</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: 'var(--surface)' }}>
          <div className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-2">Alertes food cost</div>
          <div className="text-3xl font-black mb-1" style={{ color: alertCount > 0 ? '#ef4444' : 'var(--text1)' }}>
            {alertCount}
          </div>
          <div className="text-xs" style={{ color: alertCount > 0 ? '#ef4444' : 'var(--text4)' }}>
            Food cost &gt; 35%
          </div>
        </div>
      </div>

      {/* ── Recipe grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(recipe => {
          const pct     = recipe.food_cost_pct
          const isAlert = (pct ?? 0) > 35
          const price   = recipe.product?.[0]?.price ?? null
          // margin amount = price × (1 - foodCost%)
          const marginAmt = price !== null && pct !== null ? price * (1 - pct / 100) : null
          const marginPct = pct !== null ? 100 - pct : null
          // bar uses 0–50% scale so 35% threshold sits at 70% of bar width
          const barWidth  = pct !== null ? Math.min(100, (pct / 50) * 100) : 0

          return (
            <div
              key={recipe.id}
              data-testid={`recipe-card-${recipe.id}`}
              className="rounded-xl border overflow-hidden transition-all hover:shadow-lg"
              style={{
                background:   'var(--surface)',
                borderColor:  isAlert ? 'rgba(239,68,68,.3)' : 'var(--border)',
              }}
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,.04)', color: 'var(--text3)' }}
                >
                  {recipe.title.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-[var(--text1)] truncate">{recipe.title}</div>
                  <div className="text-xs text-[var(--text4)] mt-0.5">
                    {[recipe.category, recipe.portion].filter(Boolean).join(' · ')
                      || (recipe.is_internal ? 'Recette interne' : 'Recette POS')}
                  </div>
                </div>
                {isAlert && (
                  <span
                    className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded"
                    style={{ color: '#ef4444', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)' }}
                  >
                    ⚠ Alerte
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="px-4 py-4">
                {/* Food cost % */}
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Food cost</span>
                  <span className="text-2xl font-black" style={{ color: fcColor(pct) }}>
                    {pct !== null ? `${pct}%` : '—'}
                  </span>
                </div>

                {/* Progress bar — 0–50% scale, threshold at 70% */}
                <div className="relative h-2 rounded-full mb-1" style={{ background: 'rgba(255,255,255,.06)' }}>
                  <div
                    className="absolute left-0 top-0 h-full rounded-full transition-all"
                    style={{ width: `${barWidth}%`, background: fcBarColor(pct) }}
                  />
                  <div
                    className="absolute top-0 h-full w-px"
                    style={{ left: '70%', background: 'rgba(255,255,255,.25)' }}
                  />
                </div>
                <div className="flex justify-between text-xs mb-3" style={{ color: 'var(--text4)', opacity: 0.6 }}>
                  <span>0%</span><span>35% seuil</span><span>50%</span>
                </div>

                {/* Meta: price + margin */}
                <div className="flex justify-between text-xs pt-2 border-t" style={{ borderColor: 'rgba(51,65,85,.5)', color: 'var(--text4)' }}>
                  {price !== null ? (
                    <span>Prix vente : <strong className="text-[var(--text1)]">{price.toFixed(2)} €</strong></span>
                  ) : (
                    <span className="italic">Recette interne</span>
                  )}
                  {marginAmt !== null && marginPct !== null && (
                    <span>
                      Marge : <strong style={{ color: fcColor(pct) }}>
                        {marginAmt.toFixed(2)} € ({marginPct.toFixed(0)}%)
                      </strong>
                    </span>
                  )}
                </div>

                {/* POS link badge */}
                {!recipe.is_internal && (
                  <div
                    className="flex items-center justify-between mt-3 px-2.5 py-1.5 rounded-lg"
                    style={{ background: 'rgba(29,78,216,.08)', border: '1px solid rgba(29,78,216,.2)' }}
                  >
                    <span className="text-xs" style={{ color: '#93c5fd' }}>📦 Lié au produit POS</span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded"
                      style={{ color: '#60a5fa', background: 'rgba(29,78,216,.15)' }}
                    >
                      Vendu en caisse
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => { setEditingRecipe(recipe); setShowForm(true) }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--text3)] hover:bg-[var(--surface2)] transition-colors"
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => handleDelete(recipe.id)}
                    className="py-1.5 px-3 rounded-lg text-xs text-red-500/60 hover:text-red-400 transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {/* "+" add card */}
        <div
          onClick={openNew}
          className="rounded-xl border border-dashed flex items-center justify-center min-h-[220px] cursor-pointer transition-colors hover:border-[var(--blue)]/40 hover:bg-[var(--surface)]"
          style={{ borderColor: 'rgba(255,255,255,.1)' }}
        >
          <div className="text-center" style={{ color: 'var(--text4)' }}>
            <div className="text-4xl mb-2 leading-none font-light">+</div>
            <div className="text-sm">Nouvelle recette</div>
          </div>
        </div>
      </div>

      <RecipeForm
        open={showForm}
        recipe={editingRecipe}
        categories={categories}
        onClose={() => setShowForm(false)}
        onSave={async () => { setShowForm(false); await reload() }}
      />
    </div>
  )
}
