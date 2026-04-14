// src/app/dashboard/marchandise/_components/tab-en-vente.tsx
'use client'
import { useState, useMemo } from 'react'
import type { MarchandiseItem, RecipeRow, EnVenteItem, PosCategory } from './types'
import { NetworkStatusSelect } from './network-status-select'
import { EnVenteEditModal } from './en-vente-edit-modal'

interface Props {
  items: MarchandiseItem[]
  recipes: RecipeRow[]
  categories: PosCategory[]
  establishmentId: string
}

function buildEnVenteList(items: MarchandiseItem[], recipes: RecipeRow[], categories: PosCategory[]): EnVenteItem[] {
  const catMap = new Map(categories.map(c => [c.id, c.name]))

  const directs: EnVenteItem[] = items
    .filter(i => i.is_pos && i.pos_price !== null)
    .map(i => {
      const priceTTC = i.pos_price! * (1 + i.pos_tva_rate / 100)
      const unitCost = i.purchase_qty > 0 ? i.purchase_price / i.purchase_qty : i.purchase_price
      const marginPct = priceTTC > 0 ? Math.round((1 - unitCost / priceTTC) * 1000) / 10 : null
      return {
        id: i.product_id ?? i.id,
        name: i.name,
        origin: 'direct' as const,
        source_id: i.id,
        category_id: i.pos_category_id,
        category_name: i.pos_category_id ? (catMap.get(i.pos_category_id) ?? null) : null,
        price_ttc: priceTTC,
        tva_rate: i.pos_tva_rate,
        food_cost_pct: null,
        margin_pct: marginPct,
        network_status: i.network_status,
      }
    })

  const recipeProducts: EnVenteItem[] = recipes
    .filter(r => !r.is_internal && r.product !== null)
    .map(r => {
      const p = r.product!
      const priceTTC = p.price * (1 + p.tva_rate / 100)
      const marginPct = r.food_cost_pct !== null ? Math.round((100 - r.food_cost_pct) * 10) / 10 : null
      return {
        id: p.id,
        name: r.title,
        origin: 'recette' as const,
        source_id: r.id,
        category_id: p.category_id,
        category_name: p.category_id ? (catMap.get(p.category_id) ?? null) : null,
        price_ttc: priceTTC,
        tva_rate: p.tva_rate,
        food_cost_pct: r.food_cost_pct,
        margin_pct: marginPct,
        network_status: r.network_status,
      }
    })

  return [...directs, ...recipeProducts].sort((a, b) => a.name.localeCompare(b.name))
}

export function TabEnVente({ items, recipes, categories }: Props) {
  const enVente = useMemo(
    () => buildEnVenteList(items, recipes, categories),
    [items, recipes, categories]
  )
  const [localEnVente, setLocalEnVente] = useState<EnVenteItem[]>(enVente)
  const [editItem, setEditItem] = useState<EnVenteItem | null>(null)

  // Sync when parent items/recipes change
  useMemo(() => {
    setLocalEnVente(buildEnVenteList(items, recipes, categories))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, recipes])

  function getMarginColor(pct: number | null) {
    if (pct === null) return 'var(--text4)'
    if (pct > 65) return 'var(--green)'
    if (pct > 50) return 'var(--orange)'
    return 'var(--red)'
  }

  return (
    <div>
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {/* Head */}
        <div
          className="grid gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[var(--text4)] border-b border-[var(--border)]"
          style={{ gridTemplateColumns: '1.8fr 80px 80px 60px 80px 140px 40px' }}
        >
          <span>Article</span>
          <span>Origine</span>
          <span>Prix TTC</span>
          <span className="hidden md:block">TVA</span>
          <span>Marge</span>
          <span className="hidden lg:block">Statut réseau</span>
          <span>Actions</span>
        </div>

        {localEnVente.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-[var(--text4)]">
            Aucun article en vente. Activez la vente directe sur vos marchandises ou publiez des recettes.
          </div>
        )}

        {localEnVente.map(ev => (
          <div
            key={ev.id}
            className="grid gap-3 px-4 py-3 items-center border-t border-[var(--border)] hover:bg-[var(--surface2)] transition-colors"
            style={{ gridTemplateColumns: '1.8fr 80px 80px 60px 80px 140px 40px' }}
          >
            {/* Article */}
            <div>
              <div className="text-sm font-semibold text-[var(--text1)]">{ev.name}</div>
              {ev.category_name && <div className="text-xs text-[var(--text4)] mt-0.5">{ev.category_name}</div>}
            </div>

            {/* Origine */}
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
              style={
                ev.origin === 'direct'
                  ? { background: 'rgba(37,99,235,.1)', color: 'var(--blue)' }
                  : { background: 'rgba(16,185,129,.1)', color: 'var(--green)' }
              }
            >
              {ev.origin === 'direct' ? '🛒 Direct' : '🍳 Recette'}
            </span>

            {/* Prix TTC */}
            <span className="text-sm font-bold text-[var(--text1)] tabular-nums">{ev.price_ttc.toFixed(2)} €</span>

            {/* TVA */}
            <span className="hidden md:block text-xs text-[var(--text3)]">{ev.tva_rate}%</span>

            {/* Marge */}
            <span className="text-sm font-bold tabular-nums" style={{ color: getMarginColor(ev.margin_pct) }}>
              {ev.margin_pct !== null ? `${ev.margin_pct}%` : '—'}
            </span>

            {/* Statut réseau */}
            <div className="hidden lg:block">
              <NetworkStatusSelect
                value={ev.network_status}
                table={ev.origin === 'direct' ? 'stock_items' : 'recipes'}
                id={ev.source_id}
                onUpdate={v => setLocalEnVente(prev => prev.map(i => i.id === ev.id ? { ...i, network_status: v } : i))}
              />
            </div>

            {/* Actions */}
            <button
              onClick={() => setEditItem(ev)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm hover:bg-[var(--surface2)] transition-colors"
              title="Modifier prix/TVA/catégorie"
            >
              ✏️
            </button>
          </div>
        ))}
      </div>

      {editItem && (
        <EnVenteEditModal
          item={editItem}
          categories={categories}
          onClose={() => setEditItem(null)}
          onSave={updated => {
            setLocalEnVente(prev => prev.map(i => i.id === updated.id ? updated : i))
            setEditItem(null)
          }}
        />
      )}
    </div>
  )
}
