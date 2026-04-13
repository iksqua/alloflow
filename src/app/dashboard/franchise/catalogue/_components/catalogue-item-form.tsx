'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { SopStepsEditor, type SopStepDraft } from './sop-steps-editor'

type CatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  available_from?: string | null; status: string; version: number
  network_catalog_item_data?: { payload: Record<string, unknown> }
  image_url?: string | null
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)',
  borderRadius: '8px', padding: '8px 12px', fontSize: '14px', width: '100%', outline: 'none',
}
const labelCls = 'block text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5'

function initSteps(payload: Record<string, unknown>): SopStepDraft[] {
  const raw = (payload?.steps ?? []) as SopStepDraft[]
  return raw.length > 0 ? raw.map(s => ({ ...s, id: s.id ?? crypto.randomUUID() })) : []
}

type IngPayload = {
  unit: string
  category: string
  reference_package_price: number | ''
  reference_package_size:  number | ''
}

function initIngredientPayload(payload: Record<string, unknown>): IngPayload {
  return {
    unit:                    (payload?.unit as string) ?? 'kg',
    category:                (payload?.category as string) ?? '',
    reference_package_price: (payload?.reference_package_price as number | undefined) ?? '',
    reference_package_size:  (payload?.reference_package_size as number | undefined) ?? '',
  }
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
  const [ingPayload, setIngPayload] = useState<IngPayload>(() => initIngredientPayload(form.payload))
  const [saving, setSaving] = useState(false)
  const [imageFile,    setImageFile]    = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(item?.image_url ?? null)
  const [imageRemoved, setImageRemoved] = useState(false)

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith('blob:')) {
        URL.revokeObjectURL(imagePreview)
      }
    }
  }, [imagePreview])

  function buildPayload(): Record<string, unknown> {
    if (form.type === 'sop')        return { steps: sopSteps }
    if (form.type === 'ingredient') {
      const refPrice = Number(ingPayload.reference_package_price)
      const refSize  = Number(ingPayload.reference_package_size)
      const hasRef   = refPrice > 0 && refSize > 0
      return {
        unit: ingPayload.unit,
        ...(ingPayload.category ? { category: ingPayload.category } : {}),
        ...(hasRef ? { reference_package_price: refPrice, reference_package_size: refSize } : {}),
      }
    }
    return form.payload
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (imagePreview?.startsWith('blob:')) {
      URL.revokeObjectURL(imagePreview)
    }
    setImageFile(file)
    setImageRemoved(false)
    setImagePreview(URL.createObjectURL(file))
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
      toast.success(item ? 'Item mis à jour' : 'Item créé')

      // Image lifecycle: upload new, delete removed
      let finalImageUrl: string | null = data.item.image_url ?? null

      if (imageRemoved && item?.image_url) {
        await fetch(`/api/franchise/catalogue/${data.item.id}/image`, { method: 'DELETE' })
        finalImageUrl = null
      } else if (imageFile) {
        const fd = new FormData()
        fd.append('file', imageFile)
        const imgRes = await fetch(`/api/franchise/catalogue/${data.item.id}/image`, { method: 'POST', body: fd })
        if (imgRes.ok) {
          const imgData = await imgRes.json()
          finalImageUrl = imgData.image_url
        } else {
          toast.error('Item sauvegardé mais la photo n\'a pas pu être uploadée')
        }
      }

      onSaved({ ...data.item, image_url: finalImageUrl })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const availableFromValid = form.available_from === null || form.available_from.length > 0
  const canSave = form.name.trim().length > 0 && (form.type !== 'sop' || sopSteps.length > 0) && availableFromValid

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

          {/* Photo + Nom + Description */}
          <div className="flex gap-4 items-start">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <label className="cursor-pointer">
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
                <div
                  className="w-20 h-20 rounded-xl flex flex-col items-center justify-center overflow-hidden"
                  style={{ border: '2px dashed var(--border)', background: 'var(--surface2)' }}
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full gap-1">
                      <span className="text-2xl">📷</span>
                      <span className="text-xs text-[var(--text4)]">Photo</span>
                    </div>
                  )}
                </div>
              </label>
              {imagePreview && (
                <button type="button"
                  onClick={() => { setImageFile(null); setImagePreview(null); setImageRemoved(true) }}
                  className="text-xs text-[var(--text4)] underline">
                  Supprimer
                </button>
              )}
            </div>
            <div className="flex flex-col gap-3 flex-1">
              <div>
                <label className={labelCls}>Nom *</label>
                <input style={inputStyle} value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Farine T45" />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea style={{ ...inputStyle, height: '64px', resize: 'none' }} value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Ingredient-specific fields */}
          {form.type === 'ingredient' && (
            <>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Prix du package (€)</label>
                  <input type="number" step="0.01" min="0" style={inputStyle}
                    value={ingPayload.reference_package_price}
                    onChange={e => setIngPayload(p => ({ ...p, reference_package_price: e.target.value === '' ? '' : Number(e.target.value) }))}
                    placeholder="Ex: 7.45" />
                </div>
                <div>
                  <label className={labelCls}>Contenance ({ingPayload.unit})</label>
                  <input type="number" step="1" min="0" style={inputStyle}
                    value={ingPayload.reference_package_size}
                    onChange={e => setIngPayload(p => ({ ...p, reference_package_size: e.target.value === '' ? '' : Number(e.target.value) }))}
                    placeholder="Ex: 750" />
                </div>
              </div>
              {Number(ingPayload.reference_package_price) > 0 && Number(ingPayload.reference_package_size) > 0 && (
                <p className="text-xs text-[var(--text4)] -mt-1">
                  = {(Number(ingPayload.reference_package_price) / Number(ingPayload.reference_package_size)).toFixed(4)} €/{ingPayload.unit}
                </p>
              )}
            </>
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
                {form.available_from === '' && (
                  <p className="text-xs text-amber-400 mt-1">Choisissez une date pour activer l'annonce</p>
                )}
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
