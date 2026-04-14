// src/app/dashboard/marchandise/_components/tab-marchandise.tsx
'use client'
import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MarchandiseItem, PosCategory, NetworkStatus } from './types'
import { NetworkStatusSelect } from './network-status-select'
// Reuse existing form from stocks — do not duplicate
import { StockItemForm } from '@/app/dashboard/stocks/_components/stock-item-form'
import type { StockItem } from '@/app/dashboard/stocks/_components/types'

interface Props {
  items: MarchandiseItem[]
  categories: PosCategory[]
  establishmentId: string
  onItemsChange: (items: MarchandiseItem[]) => void
}

type UsageFilter = 'all' | 'direct' | 'recipe'

export function TabMarchandise({ items, categories, establishmentId, onItemsChange }: Props) {
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all')
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<StockItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = items
    if (usageFilter === 'direct') list = list.filter(i => i.is_pos)
    if (usageFilter === 'recipe') list = list.filter(i => !i.is_pos)
    if (catFilter) list = list.filter(i => i.category === catFilter)
    return list
  }, [items, usageFilter, catFilter])

  const uniqueCategories = useMemo(
    () => [...new Set(items.map(i => i.category).filter(Boolean))] as string[],
    [items]
  )

  function toStockItem(m: MarchandiseItem): StockItem {
    return {
      ...m,
      quantity: 0,
      alert_threshold: 0,
      order_quantity: 0,
      unit_price: m.purchase_price,
      status: 'ok',
    }
  }

  function handleNetworkUpdate(id: string, value: NetworkStatus) {
    onItemsChange(items.map(i => i.id === id ? { ...i, network_status: value } : i))
  }

  async function handleDelete(id: string) {
    const supabase = createClient()
    await supabase.from('stock_items').update({ active: false }).eq('id', id)
    onItemsChange(items.filter(i => i.id !== id))
    setDeleteId(null)
  }

  async function handleDuplicate(item: MarchandiseItem) {
    const supabase = createClient()
    const { data } = await supabase
      .from('stock_items')
      .insert({
        establishment_id: establishmentId,
        name: `Copie de ${item.name}`,
        category: item.category,
        unit: item.unit,
        purchase_price: item.purchase_price,
        purchase_qty: item.purchase_qty,
        supplier: item.supplier,
        supplier_ref: item.supplier_ref,
        is_pos: item.is_pos,
        pos_price: item.pos_price,
        pos_tva_rate: item.pos_tva_rate,
        pos_category_id: item.pos_category_id,
        alert_threshold: 0,
        active: true,
        network_status: 'not_shared',
      })
      .select('*')
      .single()
    if (data) {
      onItemsChange([
        ...items,
        {
          ...item,
          id: data.id,
          name: data.name,
          network_status: 'not_shared',
        },
      ])
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span className="text-xs font-semibold text-[var(--text4)] self-center">Filtrer :</span>
        {(['all', 'direct', 'recipe'] as UsageFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setUsageFilter(f)}
            className={[
              'px-3 py-1 rounded-lg text-xs font-medium border transition-colors',
              usageFilter === f
                ? 'text-[var(--text1)] border-[var(--text4)]'
                : 'text-[var(--text4)] border-[var(--border)] hover:border-[var(--text4)]',
            ].join(' ')}
            style={usageFilter === f ? { background: 'var(--surface2)' } : undefined}
          >
            {f === 'all' ? `Tout (${items.length})` : f === 'direct' ? `🛒 Vendu direct (${items.filter(i => i.is_pos).length})` : `🍳 En recette`}
          </button>
        ))}
      </div>
      {uniqueCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs font-semibold text-[var(--text4)] self-center">Catégorie :</span>
          <button
            onClick={() => setCatFilter(null)}
            className={['px-3 py-1 rounded-2xl text-xs font-semibold border', !catFilter ? 'text-[var(--text1)] border-[var(--text4)]' : 'text-[var(--text4)] border-[var(--border)]'].join(' ')}
          >
            Tout
          </button>
          {uniqueCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(catFilter === cat ? null : cat)}
              className={['px-3 py-1 rounded-2xl text-xs font-semibold border', catFilter === cat ? 'text-[var(--text1)] border-[var(--text4)]' : 'text-[var(--text4)] border-[var(--border)]'].join(' ')}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Head */}
        <div
          className="grid gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text4)] border-b border-[var(--border)]"
          style={{ gridTemplateColumns: '1.8fr 110px 90px 130px 140px 80px' }}
        >
          <span>Article</span>
          <span className="hidden lg:block">Catégorie</span>
          <span>Coût achat</span>
          <span>Vente directe</span>
          <span className="hidden md:block">Statut réseau</span>
          <span>Actions</span>
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-[var(--text4)]">Aucun article</div>
        )}

        {filtered.map(item => {
          const unitCost = item.purchase_qty > 0 ? item.purchase_price / item.purchase_qty : item.purchase_price
          const priceTTC = item.pos_price !== null ? item.pos_price * (1 + item.pos_tva_rate / 100) : null
          const marginPct = priceTTC && unitCost > 0 ? Math.round((1 - unitCost / priceTTC) * 1000) / 10 : null

          return (
            <div
              key={item.id}
              className="grid gap-3 px-4 py-3 items-center border-t border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
              style={{ gridTemplateColumns: '1.8fr 110px 90px 130px 140px 80px' }}
            >
              {/* Article */}
              <div>
                <div className="text-sm font-semibold text-[var(--text1)]">{item.name}</div>
                {item.supplier && <div className="text-xs text-[var(--text4)] mt-0.5">{item.supplier}{item.supplier_ref ? ` · ${item.supplier_ref}` : ''}</div>}
              </div>

              {/* Catégorie */}
              <span className="hidden lg:block text-xs text-[var(--text3)]">{item.category ?? '—'}</span>

              {/* Coût achat */}
              <span className="text-sm text-[var(--text2)] tabular-nums">
                {item.purchase_price.toFixed(2)} €/{item.unit}
              </span>

              {/* Vente directe */}
              {item.is_pos && priceTTC !== null ? (
                <div>
                  <div className="text-sm font-bold text-[var(--text1)]">{priceTTC.toFixed(2)} €</div>
                  {marginPct !== null && (
                    <div className="text-xs text-[var(--text4)]">Marge <strong style={{ color: marginPct > 50 ? 'var(--green)' : 'var(--orange)' }}>{marginPct}%</strong></div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => { setEditItem(toStockItem(item)); setShowForm(true) }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--text4)] border border-[var(--border)] hover:border-[var(--text3)] transition-colors"
                >
                  + Vendre direct
                </button>
              )}

              {/* Statut réseau */}
              <div className="hidden md:block">
                <NetworkStatusSelect
                  value={item.network_status}
                  table="stock_items"
                  id={item.id}
                  onUpdate={v => handleNetworkUpdate(item.id, v)}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setEditItem(toStockItem(item)); setShowForm(true) }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors"
                  title="Modifier"
                >✏️</button>
                <button
                  onClick={() => handleDuplicate(item)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors"
                  title="Dupliquer"
                >⧉</button>
                <button
                  onClick={() => setDeleteId(item.id)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors"
                  title="Supprimer"
                >🗑</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Add button row */}
      <button
        onClick={() => { setEditItem(null); setShowForm(true) }}
        className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-[var(--text4)] border border-dashed border-[var(--border)] hover:border-[var(--text3)] hover:text-[var(--text2)] transition-colors"
      >
        + Ajouter une marchandise
      </button>

      {/* Existing StockItemForm modal — onSave receives no arg; refetch after save */}
      <StockItemForm
        open={showForm}
        item={editItem}
        categories={categories}
        onClose={() => { setShowForm(false); setEditItem(null) }}
        onSave={async () => {
          // Modal does its own Supabase write. Re-fetch after save.
          const supabase = createClient()
          const { data } = await supabase
            .from('stock_items')
            .select('*')
            .eq('establishment_id', establishmentId)
            .eq('active', true)
            .order('name')
          if (data) {
            onItemsChange(data.map(i => ({
              id: i.id,
              establishment_id: i.establishment_id,
              name: i.name,
              category: i.category,
              unit: i.unit,
              purchase_price: (i as unknown as Record<string, number>).purchase_price ?? 0,
              purchase_qty: (i as unknown as Record<string, number>).purchase_qty ?? 1,
              supplier: i.supplier,
              supplier_ref: i.supplier_ref,
              is_pos: Boolean((i as unknown as Record<string, unknown>).is_pos),
              pos_price: (i as unknown as Record<string, number | null>).pos_price ?? null,
              pos_tva_rate: (i as unknown as Record<string, number>).pos_tva_rate ?? 10,
              pos_category_id: (i as unknown as Record<string, string | null>).pos_category_id ?? null,
              product_id: (i as unknown as Record<string, string | null>).product_id ?? null,
              active: i.active,
              network_status: ((i as unknown as Record<string, string>).network_status ?? 'not_shared') as MarchandiseItem['network_status'],
            })))
          }
          setShowForm(false)
          setEditItem(null)
        }}
      />

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--overlay-bg)' }}>
          <div className="rounded-xl p-6 max-w-sm w-full mx-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-bold text-[var(--text1)] mb-2">Supprimer cet article ?</h3>
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
