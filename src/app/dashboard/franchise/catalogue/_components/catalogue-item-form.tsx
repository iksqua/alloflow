'use client'
import { useState } from 'react'
import { toast } from 'sonner'

type CatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  status: string; version: number
  network_catalog_item_data?: { payload: Record<string, unknown> }
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text1)',
  borderRadius: '8px', padding: '8px 12px', fontSize: '14px', width: '100%', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text4)',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px',
}

export function CatalogueItemForm({
  item, defaultType, onClose, onSaved,
}: {
  item: CatalogItem | null
  defaultType: 'product' | 'recipe' | 'sop'
  onClose: () => void
  onSaved: (item: CatalogItem) => void
}) {
  const [form, setForm] = useState({
    type:         item?.type ?? defaultType,
    name:         item?.name ?? '',
    description:  item?.description ?? '',
    is_mandatory: item?.is_mandatory ?? false,
    is_seasonal:  item?.is_seasonal ?? false,
    expires_at:   item?.expires_at ?? '',
    payload:      item?.network_catalog_item_data?.payload ?? {},
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const url    = item ? `/api/franchise/catalogue/${item.id}` : '/api/franchise/catalogue'
      const method = item ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, expires_at: form.expires_at || null }),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--overlay-bg)' }}>
      <div className="w-full max-w-lg rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-[var(--text1)]">{item ? 'Modifier l\'item' : 'Nouvel item catalogue'}</h2>
          <button onClick={onClose} style={{ color: 'var(--text3)', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>✕</button>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label style={labelStyle}>Type</label>
            <select style={inputStyle} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} disabled={!!item}>
              <option value="product">Produit</option>
              <option value="recipe">Recette</option>
              <option value="sop">SOP / Guide</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Nom *</label>
            <input style={inputStyle} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Cookie Chocolat" />
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <textarea style={{ ...inputStyle, height: '72px', resize: 'none' }} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_mandatory} onChange={e => setForm(p => ({ ...p, is_mandatory: e.target.checked }))} />
              <span className="text-sm text-[var(--text2)]">Obligatoire</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_seasonal} onChange={e => setForm(p => ({ ...p, is_seasonal: e.target.checked }))} />
              <span className="text-sm text-[var(--text2)]">Saisonnier</span>
            </label>
          </div>
          {form.is_seasonal && (
            <div>
              <label style={labelStyle}>Date d'expiration</label>
              <input type="date" style={inputStyle} value={form.expires_at ?? ''} onChange={e => setForm(p => ({ ...p, expires_at: e.target.value }))} />
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>Annuler</button>
          <button onClick={handleSave} disabled={saving || !form.name} className="flex-1 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--blue)', opacity: (saving || !form.name) ? 0.5 : 1 }}>
            {saving ? 'Enregistrement…' : item ? 'Mettre à jour' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}
