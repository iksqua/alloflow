'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { SopForm } from '@/app/dashboard/sops/_components/sop-form'
import { SopKitchenMode } from '@/app/dashboard/sops/_components/sop-kitchen-mode'
import type { SopCategory, SopWithSteps as SopWithStepsFull } from '@/app/dashboard/sops/_components/types'
import type { RecipeRow } from './types'

type PanelTab = 'ingredients' | 'sop'

interface Props {
  recipe: RecipeRow
  establishmentId: string
  onRecipeUpdate: (recipe: RecipeRow) => void
}

export function SopPanel({ recipe, establishmentId, onRecipeUpdate }: Props) {
  const [tab, setTab] = useState<PanelTab>('ingredients')
  const [showSopForm, setShowSopForm] = useState(false)
  const [showKitchenMode, setShowKitchenMode] = useState(false)
  const [sopRequired, setSopRequired] = useState(recipe.sop_required)
  const [toggling, setToggling] = useState(false)
  const [duplicating, setDuplicating] = useState(false)

  const supabase = createClient()

  // ── Build the full SopWithSteps object for SopForm (needs extra fields from sops types) ──
  const sopForForm: SopWithStepsFull | null = recipe.sop
    ? {
        id:          recipe.sop.id,
        title:       recipe.sop.title,
        content:     null,
        category_id: null,
        recipe_id:   recipe.sop.recipe_id,
        active:      recipe.sop.active,
        category:    null,
        recipe:      { id: recipe.id, title: recipe.title },
        step_count:  recipe.sop.steps.length,
        total_duration_seconds: recipe.sop.steps.reduce(
          (acc, s) => acc + (s.duration_seconds ?? 0), 0
        ),
        has_video: recipe.sop.steps.some(s => !!s.media_url),
        steps: recipe.sop.steps.map(s => ({
          id:               s.id,
          sop_id:           s.sop_id,
          sort_order:       s.sort_order,
          title:            s.title,
          description:      s.description,
          duration_seconds: s.duration_seconds,
          media_url:        s.media_url,
          note_type:        null,
          note_text:        null,
        })),
      }
    : null

  // ── Build SopWithStepsFull for kitchen mode ──
  const sopForKitchen: SopWithStepsFull | null = sopForForm

  async function toggleSopRequired() {
    setToggling(true)
    const newVal = !sopRequired
    const { error } = await supabase
      .from('recipes')
      .update({ sop_required: newVal })
      .eq('id', recipe.id)
      .eq('establishment_id', establishmentId)
    if (!error) {
      setSopRequired(newVal)
      onRecipeUpdate({ ...recipe, sop_required: newVal })
    }
    setToggling(false)
  }

  async function handleDuplicateSop() {
    if (!recipe.sop) return
    setDuplicating(true)
    try {
      // Create new detached SOP (recipe_id = null)
      const { data: newSop, error: sopErr } = await supabase
        .from('sops')
        .insert({
          establishment_id: establishmentId,
          title:            `${recipe.sop.title} (copie)`,
          recipe_id:        null,
          active:           true,
        })
        .select('id')
        .single()
      if (sopErr || !newSop) throw sopErr ?? new Error('Erreur duplication SOP')

      // Copy steps
      if (recipe.sop.steps.length > 0) {
        const stepInserts = recipe.sop.steps.map((s, idx) => ({
          sop_id:           newSop.id,
          sort_order:       idx,
          title:            s.title,
          description:      s.description,
          duration_seconds: s.duration_seconds,
          media_url:        s.media_url,
          note_type:        null,
          note_text:        null,
        }))
        const { error: stepsErr } = await supabase.from('sop_steps').insert(stepInserts)
        if (stepsErr) throw stepsErr
      }
    } finally {
      setDuplicating(false)
    }
  }

  async function refetchSop() {
    const { data } = await supabase
      .from('sops')
      .select('id, title, recipe_id, active, sop_steps(*)')
      .eq('recipe_id', recipe.id)
      .maybeSingle()

    const newSop = data
      ? {
          id:       data.id,
          title:    data.title,
          recipe_id: data.recipe_id,
          active:   data.active,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          steps: ((data as any).sop_steps ?? []).map((s: any) => ({
            id:               s.id,
            sop_id:           s.sop_id,
            sort_order:       s.sort_order,
            title:            s.title,
            description:      s.description,
            duration_seconds: s.duration_seconds ?? null,
            media_url:        s.media_url ?? null,
          })),
        }
      : null

    onRecipeUpdate({ ...recipe, sop: newSop })
  }

  async function handleSopFormSave() {
    await refetchSop()
  }

  // ── Ingredient totals ──
  const totalCost = recipe.ingredients.reduce(
    (acc, ing) => acc + ing.quantity * ing.unit_cost,
    0
  )
  const priceTtc = recipe.product
    ? recipe.product.price * (1 + recipe.product.tva_rate / 100)
    : null
  const foodCostPct = priceTtc && priceTtc > 0
    ? (totalCost / priceTtc) * 100
    : null

  return (
    <div style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>
      {/* Sub-tabs */}
      <div className="flex gap-1 px-4 pt-3 pb-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => setTab('ingredients')}
          className="px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors"
          style={{
            background: tab === 'ingredients' ? 'var(--surface)' : 'transparent',
            color: tab === 'ingredients' ? 'var(--text1)' : 'var(--text4)',
            borderBottom: tab === 'ingredients' ? '2px solid var(--blue)' : '2px solid transparent',
          }}
        >
          🧪 Ingrédients
        </button>
        <button
          onClick={() => setTab('sop')}
          className="px-3 py-1.5 text-xs font-semibold rounded-t-md transition-colors"
          style={{
            background: tab === 'sop' ? 'var(--surface)' : 'transparent',
            color: tab === 'sop' ? 'var(--text1)' : 'var(--text4)',
            borderBottom: tab === 'sop' ? '2px solid var(--blue)' : '2px solid transparent',
          }}
        >
          📋 Guide SOP
        </button>
      </div>

      {/* ── Ingrédients tab ── */}
      {tab === 'ingredients' && (
        <div className="p-4">
          {recipe.ingredients.length === 0 ? (
            <p className="text-xs text-[var(--text4)] text-center py-6">
              Aucun ingrédient défini pour cette recette.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left pb-2 font-semibold text-[var(--text4)] uppercase tracking-wide">Ingrédient</th>
                  <th className="text-right pb-2 font-semibold text-[var(--text4)] uppercase tracking-wide">Qté</th>
                  <th className="text-right pb-2 font-semibold text-[var(--text4)] uppercase tracking-wide">Unité</th>
                  <th className="text-right pb-2 font-semibold text-[var(--text4)] uppercase tracking-wide">Coût unit.</th>
                  <th className="text-right pb-2 font-semibold text-[var(--text4)] uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody>
                {recipe.ingredients
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map(ing => (
                    <tr key={ing.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="py-2 text-[var(--text2)]">{ing.name}</td>
                      <td className="py-2 text-right text-[var(--text2)]">{ing.quantity}</td>
                      <td className="py-2 text-right text-[var(--text3)]">{ing.unit}</td>
                      <td className="py-2 text-right text-[var(--text3)]">{ing.unit_cost.toFixed(4)} €</td>
                      <td className="py-2 text-right font-medium text-[var(--text1)]">
                        {(ing.quantity * ing.unit_cost).toFixed(3)} €
                      </td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td colSpan={4} className="pt-2 font-bold text-[var(--text2)]">Coût matière total</td>
                  <td className="pt-2 text-right font-bold text-[var(--text1)]">{totalCost.toFixed(3)} €</td>
                </tr>
                {priceTtc !== null && (
                  <tr>
                    <td colSpan={4} className="pt-1 text-[var(--text3)]">Prix de vente TTC</td>
                    <td className="pt-1 text-right text-[var(--text3)]">{priceTtc.toFixed(2)} €</td>
                  </tr>
                )}
                {foodCostPct !== null && (
                  <tr>
                    <td colSpan={4} className="pt-1 font-semibold text-[var(--text3)]">Food cost</td>
                    <td
                      className="pt-1 text-right font-bold"
                      style={{
                        color: foodCostPct > 35
                          ? 'var(--orange)'
                          : foodCostPct > 28
                          ? '#eab308'
                          : 'var(--green)',
                      }}
                    >
                      {foodCostPct.toFixed(1)} %
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ── Guide SOP tab ── */}
      {tab === 'sop' && (
        <div className="p-4 space-y-3">
          {/* Toggle "Guide requis ?" */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[var(--text2)]">Guide requis ?</span>
              <p className="text-[11px] text-[var(--text4)]">
                Exige un guide SOP avant la préparation de ce plat
              </p>
            </div>
            <button
              onClick={toggleSopRequired}
              disabled={toggling}
              className="relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 cursor-pointer"
              style={{ background: sopRequired ? 'var(--blue)' : 'var(--border)' }}
              role="switch"
              aria-checked={sopRequired}
            >
              <span
                className="pointer-events-none inline-block h-4 w-4 rounded-full shadow transform transition-transform duration-200"
                style={{
                  background: 'white',
                  transform: sopRequired ? 'translateX(16px)' : 'translateX(0)',
                }}
              />
            </button>
          </div>

          {/* No SOP → create button */}
          {!recipe.sop ? (
            <div
              className="flex flex-col items-center gap-3 py-6 rounded-xl border border-dashed"
              style={{ borderColor: 'var(--border)' }}
            >
              <p className="text-xs text-[var(--text4)]">Aucun guide SOP pour cette recette.</p>
              <button
                onClick={() => setShowSopForm(true)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ background: 'var(--blue)' }}
              >
                + Créer un guide
              </button>
            </div>
          ) : (
            <>
              {/* SOP header with actions */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--text1)]">{recipe.sop.title}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowKitchenMode(true)}
                    disabled={recipe.sop.steps.length === 0}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text2)',
                    }}
                  >
                    ▶ Mode cuisine
                  </button>
                  <button
                    onClick={handleDuplicateSop}
                    disabled={duplicating}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text2)',
                    }}
                  >
                    {duplicating ? '…' : 'Dupliquer guide'}
                  </button>
                  <button
                    onClick={() => setShowSopForm(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
                    style={{ background: 'var(--blue)' }}
                  >
                    Modifier
                  </button>
                </div>
              </div>

              {/* Steps list */}
              {recipe.sop.steps.length === 0 ? (
                <p className="text-xs text-[var(--text4)]">Ce guide n'a pas encore d'étapes.</p>
              ) : (
                <ol className="space-y-2">
                  {recipe.sop.steps
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((step, idx) => (
                      <li
                        key={step.id}
                        className="flex gap-3 rounded-lg p-3"
                        style={{ background: 'var(--surface)' }}
                      >
                        <span
                          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ background: 'var(--blue)' }}
                        >
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-[var(--text1)]">{step.title}</p>
                          {step.description && (
                            <p className="text-[11px] text-[var(--text3)] mt-0.5 leading-relaxed">
                              {step.description}
                            </p>
                          )}
                          {step.duration_seconds && (
                            <p className="text-[10px] text-[var(--text4)] mt-1">
                              ⏱ {Math.floor(step.duration_seconds / 60)}m{step.duration_seconds % 60 > 0 ? ` ${step.duration_seconds % 60}s` : ''}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}

      {/* ── SopForm modal ── */}
      <SopForm
        open={showSopForm}
        sop={sopForForm}
        categories={[] as SopCategory[]}
        recipes={[{ id: recipe.id, title: recipe.title }]}
        onClose={() => setShowSopForm(false)}
        onSave={handleSopFormSave}
      />

      {/* ── Kitchen mode modal ── */}
      {showKitchenMode && sopForKitchen && (
        <SopKitchenMode
          sop={sopForKitchen}
          onClose={() => setShowKitchenMode(false)}
        />
      )}
    </div>
  )
}
