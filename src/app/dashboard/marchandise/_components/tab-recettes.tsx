// src/app/dashboard/marchandise/_components/tab-recettes.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RecipeRow, PosCategory, NetworkStatus } from './types'
import { NetworkStatusSelect } from './network-status-select'
import { SopPanel } from './sop-panel'
import { RecipeForm } from '@/app/dashboard/recettes/_components/recipe-form'
import type { Recipe } from '@/app/dashboard/recettes/_components/types'

interface Props {
  recipes: RecipeRow[]
  categories: PosCategory[]
  establishmentId: string
  onRecipesChange: (recipes: RecipeRow[]) => void
}

export function TabRecettes({ recipes, categories, establishmentId, onRecipesChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function toRecipeType(r: RecipeRow): Recipe {
    return {
      id: r.id,
      establishment_id: r.establishment_id,
      title: r.title,
      description: null,
      category: r.category,
      portion: r.portion,
      is_internal: r.is_internal,
      active: r.active,
      created_at: '',
      ingredients: r.ingredients,
      product: r.product ? [r.product] : null,
      food_cost_amount: r.food_cost_amount,
      food_cost_pct: r.food_cost_pct,
    }
  }

  async function refetchRecipes(): Promise<RecipeRow[]> {
    const supabase = createClient()
    const { data } = await supabase
      .from('recipes')
      .select(`
        *,
        ingredients:recipe_ingredients(id, name, quantity, unit, unit_cost, sort_order),
        product:products!products_recipe_id_fkey(id, name, price, tva_rate, category_id, is_active),
        sop:sops(id, title, recipe_id, active, steps:sop_steps(id, sop_id, title, description, sort_order, duration_seconds, media_url))
      `)
      .eq('establishment_id', establishmentId)
      .eq('active', true)
      .order('title')
    if (!data) return recipes
    return data.map(r => {
      const ings = r.ingredients ?? []
      const foodCostAmount = ings.reduce((s: number, i: { quantity: number; unit_cost: number }) => s + i.quantity * i.unit_cost, 0)
      const product = r.product?.[0] ?? null
      const foodCostPct = product?.price && product.price > 0
        ? Math.round((foodCostAmount / product.price) * 1000) / 10
        : null
      const existing = recipes.find(ex => ex.id === r.id)
      return {
        id: r.id,
        establishment_id: r.establishment_id,
        title: r.title,
        category: r.category,
        portion: r.portion,
        is_internal: r.is_internal,
        active: r.active,
        sop_required: Boolean((r as unknown as Record<string, unknown>).sop_required),
        network_status: existing?.network_status ?? (((r as unknown as Record<string, string>).network_status ?? 'not_shared') as RecipeRow['network_status']),
        ingredients: ings,
        product,
        sop: r.sop?.[0] ? { ...r.sop[0], steps: r.sop[0].steps ?? [] } : null,
        food_cost_amount: foodCostAmount,
        food_cost_pct: foodCostPct,
      }
    })
  }

  function handleNetworkUpdate(id: string, value: NetworkStatus) {
    onRecipesChange(recipes.map(r => r.id === id ? { ...r, network_status: value } : r))
  }

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('recipes').update({ active: false }).eq('id', id)
    onRecipesChange(recipes.filter(r => r.id !== id))
    setDeleteId(null)
  }

  async function handleDuplicate(recipe: RecipeRow) {
    const supabase = createClient()
    const { data: newRecipe } = await supabase
      .from('recipes')
      .insert({
        establishment_id: establishmentId,
        title: `Copie de ${recipe.title}`,
        category: recipe.category,
        portion: recipe.portion,
        is_internal: true,
        active: true,
        sop_required: false,
        network_status: 'not_shared',
      })
      .select('id')
      .single()
    if (!newRecipe) return

    if (recipe.ingredients.length > 0) {
      await supabase.from('recipe_ingredients').insert(
        recipe.ingredients.map(i => ({
          recipe_id: newRecipe.id,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          unit_cost: i.unit_cost,
          sort_order: i.sort_order,
        }))
      )
    }

    let newSop = null
    if (recipe.sop) {
      const { data: sopData } = await supabase
        .from('sops')
        .insert({
          establishment_id: establishmentId,
          title: recipe.sop.title,
          recipe_id: newRecipe.id,
          active: true,
        })
        .select('id, title, recipe_id, active')
        .single()
      if (sopData && recipe.sop.steps.length > 0) {
        const { data: stepsData } = await supabase
          .from('sop_steps')
          .insert(
            recipe.sop.steps.map(s => ({
              sop_id: sopData.id,
              title: s.title,
              description: s.description,
              sort_order: s.sort_order,
              duration_seconds: s.duration_seconds,
              media_url: s.media_url,
            }))
          )
          .select('*')
        newSop = { ...sopData, steps: stepsData ?? [] }
      } else if (sopData) {
        newSop = { ...sopData, steps: [] }
      }
    }

    const copy: RecipeRow = {
      ...recipe,
      id: newRecipe.id,
      title: `Copie de ${recipe.title}`,
      is_internal: true,
      sop_required: false,
      network_status: 'not_shared',
      product: null,
      sop: newSop,
    }
    onRecipesChange([...recipes, copy])
  }

  function getFoodCostColor(pct: number | null) {
    if (pct === null) return 'var(--text4)'
    if (pct < 25) return 'var(--green)'
    if (pct < 35) return 'var(--orange)'
    return 'var(--red)'
  }

  function getSopStatus(recipe: RecipeRow): { label: string; color: string } {
    if (recipe.sop) return { label: '📋 Guide ✓', color: 'var(--green)' }
    if (recipe.sop_required) return { label: '⚠ Manquant', color: 'var(--red)' }
    return { label: '— Sans guide', color: 'var(--text4)' }
  }

  return (
    <div>
      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Head */}
        <div
          className="grid gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text4)] border-b border-[var(--border)]"
          style={{ gridTemplateColumns: '28px 1.6fr 90px 80px 90px 140px 80px' }}
        >
          <span />
          <span>Recette</span>
          <span>Food cost</span>
          <span className="hidden md:block">Prix TTC</span>
          <span className="hidden md:block">Guide SOP</span>
          <span className="hidden lg:block">Statut réseau</span>
          <span>Actions</span>
        </div>

        {recipes.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-[var(--text4)]">Aucune recette</div>
        )}

        {recipes.map(recipe => {
          const isOpen = expandedId === recipe.id
          const sop = getSopStatus(recipe)
          const priceTTC = recipe.product
            ? recipe.product.price * (1 + recipe.product.tva_rate / 100)
            : null

          return (
            <div key={recipe.id} className="border-t border-[var(--border)]">
              {/* Row */}
              <div
                className="grid gap-3 px-4 py-3 items-center hover:bg-[var(--surface2)] transition-colors cursor-pointer"
                style={{ gridTemplateColumns: '28px 1.6fr 90px 80px 90px 140px 80px' }}
                onClick={() => setExpandedId(isOpen ? null : recipe.id)}
              >
                {/* Chevron */}
                <span
                  className="text-sm transition-transform duration-200 select-none"
                  style={{
                    color: isOpen ? 'var(--blue)' : 'var(--text4)',
                    transform: isOpen ? 'rotate(90deg)' : 'none',
                    display: 'inline-block',
                  }}
                >
                  ▶
                </span>

                {/* Recette */}
                <div>
                  <div className="text-sm font-semibold text-[var(--text1)]">{recipe.title}</div>
                  {recipe.category && <div className="text-xs text-[var(--text4)] mt-0.5">{recipe.category}</div>}
                </div>

                {/* Food cost */}
                <div>
                  <div className="text-sm font-bold tabular-nums" style={{ color: getFoodCostColor(recipe.food_cost_pct) }}>
                    {recipe.food_cost_pct !== null ? `${recipe.food_cost_pct}%` : '—'}
                  </div>
                  {recipe.food_cost_pct !== null && (
                    <div className="h-1 w-12 rounded-full mt-1 overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(recipe.food_cost_pct, 100)}%`, background: getFoodCostColor(recipe.food_cost_pct) }}
                      />
                    </div>
                  )}
                </div>

                {/* Prix TTC */}
                <span className="hidden md:block text-sm text-[var(--text2)] tabular-nums">
                  {priceTTC !== null ? `${priceTTC.toFixed(2)} €` : '—'}
                </span>

                {/* Guide SOP */}
                <span className="hidden md:block text-xs font-semibold" style={{ color: sop.color }}>
                  {sop.label}
                </span>

                {/* Statut réseau */}
                <div className="hidden lg:block" onClick={e => e.stopPropagation()}>
                  <NetworkStatusSelect
                    value={recipe.network_status}
                    table="recipes"
                    id={recipe.id}
                    onUpdate={v => handleNetworkUpdate(recipe.id, v)}
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { setEditRecipe(toRecipeType(recipe)); setShowForm(true) }} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors" title="Modifier">✏️</button>
                  <button onClick={() => handleDuplicate(recipe)} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors" title="Dupliquer">⧉</button>
                  <button onClick={() => setDeleteId(recipe.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors" title="Supprimer">🗑</button>
                </div>
              </div>

              {/* Expanded SopPanel */}
              {isOpen && (
                <SopPanel
                  recipe={recipe}
                  establishmentId={establishmentId}
                  onRecipeUpdate={updated => onRecipesChange(recipes.map(r => r.id === updated.id ? updated : r))}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Add row */}
      <button
        onClick={() => { setEditRecipe(null); setShowForm(true) }}
        className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-[var(--text4)] border border-dashed border-[var(--border)] hover:border-[var(--text3)] hover:text-[var(--text2)] transition-colors"
      >
        + Nouvelle recette
      </button>

      {/* RecipeForm — onSave receives NO arg; refetch after save */}
      <RecipeForm
        open={showForm}
        recipe={editRecipe}
        categories={categories.map(c => ({ ...c, icon: c.icon ?? null }))}
        onClose={() => { setShowForm(false); setEditRecipe(null) }}
        onSave={async () => {
          const fresh = await refetchRecipes()
          onRecipesChange(fresh)
          setShowForm(false)
          setEditRecipe(null)
        }}
      />

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--overlay-bg)' }}>
          <div className="rounded-xl p-6 max-w-sm w-full mx-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-bold text-[var(--text1)] mb-2">Supprimer cette recette ?</h3>
            <p className="text-sm text-[var(--text3)] mb-5">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-[var(--text2)] border border-[var(--border)]">Annuler</button>
              <button onClick={() => handleDelete(deleteId)} className="flex-1 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--red)' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
