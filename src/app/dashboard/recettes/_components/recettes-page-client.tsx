// src/app/dashboard/recettes/_components/recettes-page-client.tsx
'use client'
import { useState } from 'react'
import { FoodCostIndicator } from './food-cost-indicator'
import { RecipeForm } from './recipe-form'
import type { Recipe } from './types'

interface Category { id: string; name: string; color_hex: string; icon: string | null }

interface Props {
  initialRecipes: Recipe[]
  categories: Category[]
}

export function RecettesPageClient({ initialRecipes, categories }: Props) {
  const [recipes, setRecipes] = useState(initialRecipes)
  const [showForm, setShowForm] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)
  const [filter, setFilter] = useState<'all' | 'pos' | 'internal'>('all')

  const filtered = recipes.filter(r =>
    filter === 'all' ? true
    : filter === 'pos' ? !r.is_internal
    : r.is_internal
  )

  const posCount      = recipes.filter(r => !r.is_internal).length
  const internalCount = recipes.filter(r => r.is_internal).length

  async function reload() {
    const res = await fetch('/api/recipes')
    const json = await res.json()
    setRecipes(json.recipes ?? [])
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer cette recette ?')) return
    await fetch(`/api/recipes/${id}`, { method: 'DELETE' })
    await reload()
  }

  return (
    <div>
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text1)]">Recettes</h1>
            <p className="text-xs text-[var(--text4)] mt-0.5">
              {posCount} vendue{posCount !== 1 ? 's' : ''} en caisse · {internalCount} interne{internalCount !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => { setEditingRecipe(null); setShowForm(true) }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--blue)' }}
          >
            + Nouvelle recette
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-5 border-b border-[var(--border)]">
          {[
            { key: 'all',      label: `Toutes (${recipes.length})` },
            { key: 'pos',      label: `🧾 Caisse POS (${posCount})` },
            { key: 'internal', label: `🔒 Internes (${internalCount})` },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                filter === tab.key
                  ? 'border-[var(--blue)] text-white'
                  : 'border-transparent text-[var(--text3)] hover:text-[var(--text2)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Recipe cards */}
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📖</div>
            <div className="font-semibold text-[var(--text2)]">Aucune recette</div>
            <div className="text-sm text-[var(--text4)] mt-1">Commencez par créer votre première recette</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(recipe => (
              <div
                key={recipe.id}
                className="rounded-xl border border-[var(--border)] p-4 hover:border-[var(--blue)]/40 transition-colors"
                style={{ background: 'var(--surface)' }}
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[var(--text1)] truncate">{recipe.title}</h3>
                    {recipe.category && (
                      <span className="text-xs text-[var(--text4)]">{recipe.category}</span>
                    )}
                  </div>
                  <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded ${
                    recipe.is_internal
                      ? 'bg-[var(--surface2)] text-[var(--text4)]'
                      : 'bg-blue-900/20 text-blue-400'
                  }`}>
                    {recipe.is_internal ? '🔒 Interne' : '🧾 POS'}
                  </span>
                </div>

                {/* Ingredients count */}
                <p className="text-xs text-[var(--text4)] mb-3">
                  {recipe.ingredients?.length ?? 0} ingrédient{(recipe.ingredients?.length ?? 0) !== 1 ? 's' : ''}
                  {recipe.portion ? ` · ${recipe.portion}` : ''}
                </p>

                {/* Food cost */}
                <div className="mb-3">
                  <FoodCostIndicator
                    amount={recipe.food_cost_amount}
                    pct={recipe.food_cost_pct}
                  />
                </div>

                {/* POS price */}
                {!recipe.is_internal && recipe.product?.[0] && (
                  <div className="flex items-center justify-between text-xs mb-3 px-2 py-1.5 rounded-lg" style={{ background: 'var(--bg)' }}>
                    <span className="text-[var(--text4)]">Prix de vente</span>
                    <span className="font-bold text-[var(--text1)]">{recipe.product[0].price.toFixed(2)} €</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setEditingRecipe(recipe); setShowForm(true) }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--text3)] hover:bg-[var(--surface2)]"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => handleDelete(recipe.id)}
                    className="py-1.5 px-3 rounded-lg text-xs font-medium text-red-500/60 hover:text-red-400"
                  >
                    Suppr.
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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
