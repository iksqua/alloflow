'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { SopStepsEditor, type SopStepDraft } from './sop-steps-editor'

type CatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  available_from?: string | null; status: string; version: number
  network_catalog_item_data?: { payload: Record<string, unknown> }
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)',
  borderRadius: '8px', padding: '8px 12px', fontSize: '14px', width: '100%', outline: 'none',
}
const labelCls = 'block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5'

function initSteps(payload: Record<string, unknown>): SopStepDraft[] {
  const raw = (payload?.steps ?? []) as SopStepDraft[]
  return raw.length > 0 ? raw : []
}

function initIngredientPayload(payload: Record<string, unknown>) {
  return { unit: (payload?.unit as string) ?? 'kg', category: (payload?.category as string) ?? '' }
}

export function CatalogueItemForm({
  item, defaultType, onClose, onSaved,
}: {
  item: CatalogItem | null
  defaultType: 'product' | 'recipe' | 'sop' | 'ingredient'
  onClose: () => void
  onSaved: (item: CatalogItem) => void
}) {
  const [form, setForm] = useState({
    type:           item?.type ?? defaultType,
    name:           item?.name ?? '',
    description:    item?.description ?? '',
    is_mandatory:   item?.is_mandatory ?? false,
    is_seasonal:    item?.is_seasonal ?? false,
    expires_at:     item?.expires_at ?? '',
    available_from: item?.available_from ?? null as string | null,
    payload:        item?.network_catalog_item_data?.payload ?? {},
  })
  const [sopSteps,  setSopSteps]  = useState<SopStepDraft[]>(() => initSteps(form.payload))
  const [ingPayload, setIngPayload] = useState(() => initIngredientPayload(form.payload))
  const [saving, setSaving] = useState(false)

  function buildPayload(): Record<string, unknown> {
    if (form.type === 'sop')        return { steps: sopSteps }
    if (form.type === 'ingredient') return { unit: ingPayload.unit, ...(ingPayload.category ? { category: ingPayload.category } : {}) }
    return form.payload
  }

  async function handleSave() {
    if (form.type === 'sop' && sopSteps.length === 0) {
      toast.error('Un SOP doit avoir au moins une étape')
      return
    }
    setSaving(true)
    try {
      const url    = item ? `/api/franchise/catalogue/${item.id}` : '/api/franchise/catalogue'
      const method = item ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          expires_at:     form.expires_at     || null,
          available_from: form.available_from || null,
          payload:        buildPayload(),
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error?.message ?? d.error ?? 'Erreur') }
      const data = await res.json()
      onSaved(data.item)
      toast.success(item ? 'Item mis à jour' : 'Item créé')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const canSave = form.name.trim().length > 0 && (form.type !== 'sop' || sopSteps.length > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--overlay-bg)' }}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[var(--text1)]">{item ? 'Modifier l\'item' : 'Nouvel item catalogue'}</h2>
          <button onClick={onClose} className="text-lg text-[var(--text3)] hover:text-[var(--text1)] transition-colors" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        <div className="flex flex-col gap-4">
          {/* Type */}
          <div>
            <label className={labelCls}>Type</label>
            <select style={inputStyle} value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))} disabled={!!item}>
              <option value="product">Produit</option>
              <option value="recipe">Recette</option>
              <option value="sop">SOP / Guide</option>
              <option value="ingredient">Ingrédient</option>
            </select>
          </div>

          {/* Nom */}
          <div>
            <label className={labelCls}>Nom *</label>
            <input style={inputStyle} value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Farine T45" />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea style={{ ...inputStyle, height: '64px', resize: 'none' }} value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>

          {/* Ingredient-specific fields */}
          {form.type === 'ingredient' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Unité *</label>
                <select style={inputStyle} value={ingPayload.unit}
                  onChange={e => setIngPayload(p => ({ ...p, unit: e.target.value }))}>
                  {['g', 'kg', 'ml', 'cl', 'L', 'pièce'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Catégorie</label>
                <input style={inputStyle} value={ingPayload.category}
                  onChange={e => setIngPayload(p => ({ ...p, category: e.target.value }))}
                  placeholder="Ex: Pâtisserie" />
              </div>
            </div>
          )}

          {/* SOP step editor */}
          {form.type === 'sop' && (
            <div>
              <label className={labelCls}>Étapes *</label>
              <SopStepsEditor steps={sopSteps} onChange={setSopSteps} />
            </div>
          )}

          {/* Flags */}
          <div className="flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_mandatory}
                onChange={e => setForm(p => ({ ...p, is_mandatory: e.target.checked }))} />
              <span className="text-sm text-[var(--text2)]">Obligatoire</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_seasonal}
                onChange={e => setForm(p => ({ ...p, is_seasonal: e.target.checked }))} />
              <span className="text-sm text-[var(--text2)]">Saisonnier</span>
            </label>
          </div>

          {form.is_seasonal && (
            <div>
              <label className={labelCls}>Date d'expiration</label>
              <input type="date" style={inputStyle} value={form.expires_at ?? ''}
                onChange={e => setForm(p => ({ ...p, expires_at: e.target.value }))} />
            </div>
          )}

          {/* Available from */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox"
                checked={form.available_from !== null}
                onChange={e => setForm(p => ({ ...p, available_from: e.target.checked ? '' : null }))} />
              <span className="text-sm text-[var(--text2)]">Annoncer à l'avance (PROCHAINEMENT)</span>
            </label>
            {form.available_from !== null && (
              <div>
                <label className={labelCls}>Disponible à partir du</label>
                <input type="date" style={inputStyle} value={form.available_from ?? ''}
                  onChange={e => setForm(p => ({ ...p, available_from: e.target.value }))} />
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm"
            style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={saving || !canSave}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--blue)', opacity: (saving || !canSave) ? 0.5 : 1 }}>
            {saving ? 'Enregistrement…' : item ? 'Mettre à jour' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}
