// src/app/dashboard/marchandise/_components/en-vente-edit-modal.tsx
'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { EnVenteItem, PosCategory } from './types'

interface Props {
  item: EnVenteItem
  categories: PosCategory[]
  onClose: () => void
  onSave: (updated: EnVenteItem) => void
}

export function EnVenteEditModal({ item, categories, onClose, onSave }: Props) {
  const [priceTTC, setPriceTTC] = useState(item.price_ttc.toFixed(2))
  const [tvaRate, setTvaRate] = useState(item.tva_rate.toString())
  const [categoryId, setCategoryId] = useState(item.category_id ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const ttcVal = parseFloat(priceTTC)
    const tvaVal = parseFloat(tvaRate)
    const priceHT = ttcVal / (1 + tvaVal / 100)

    if (item.origin === 'direct') {
      await supabase
        .from('stock_items')
        .update({
          pos_price: priceHT,
          pos_tva_rate: tvaVal,
          pos_category_id: categoryId || null,
        })
        .eq('id', item.source_id)
    } else {
      // Recette → update the product record
      await supabase
        .from('products')
        .update({
          price: priceHT,
          tva_rate: tvaVal,
          category_id: categoryId || null,
        })
        .eq('id', item.id)
    }

    const cat = categories.find(c => c.id === categoryId)
    onSave({
      ...item,
      price_ttc: ttcVal,
      tva_rate: tvaVal,
      category_id: categoryId || null,
      category_name: cat?.name ?? null,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--overlay-bg)' }}>
      <div className="rounded-xl w-full max-w-sm mx-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="p-5 border-b border-[var(--border)]">
          <h2 className="text-base font-bold text-[var(--text1)]">Modifier l&apos;article</h2>
          <p className="text-xs text-[var(--text4)] mt-0.5">{item.name}</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5 block">Prix TTC (€)</label>
            <input
              type="number"
              step="0.01"
              value={priceTTC}
              onChange={e => setPriceTTC(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text1)] border border-[var(--border)] outline-none focus:border-[var(--blue)]"
              style={{ background: 'var(--surface2)' }}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5 block">TVA (%)</label>
            <select
              value={tvaRate}
              onChange={e => setTvaRate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text1)] border border-[var(--border)] outline-none"
              style={{ background: 'var(--surface2)' }}
            >
              <option value="0">0%</option>
              <option value="5.5">5.5%</option>
              <option value="10">10%</option>
              <option value="20">20%</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1.5 block">Catégorie caisse</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm text-[var(--text1)] border border-[var(--border)] outline-none"
              style={{ background: 'var(--surface2)' }}
            >
              <option value="">Sans catégorie</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="p-5 flex gap-3 border-t border-[var(--border)]">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm font-semibold text-[var(--text2)] border border-[var(--border)]">Annuler</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'var(--blue)', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
