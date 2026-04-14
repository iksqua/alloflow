'use client'
import { useMemo } from 'react'
import type { MarchandiseItem, RecipeRow, PosCategory } from './types'

interface PosProduct {
  id: string
  name: string
  price_ttc: number
  category_id: string | null
  category_name: string | null
  network_status: string
  origin: 'direct' | 'recette'
}

interface Props {
  items: MarchandiseItem[]
  recipes: RecipeRow[]
  categories: PosCategory[]
}

export function TabApercuCaisse({ items, recipes, categories }: Props) {
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  // Show ALL items (direct + recipe), not just active ones.
  // The aperçu caisse is a read-only preview — network_status is shown as an indicator, not a filter.
  const products = useMemo<PosProduct[]>(() => {
    const directs: PosProduct[] = items
      .filter(i => i.is_pos && i.pos_price !== null)
      .map(i => ({
        id: i.product_id ?? i.id,
        name: i.name,
        price_ttc: i.pos_price! * (1 + i.pos_tva_rate / 100),
        category_id: i.pos_category_id,
        category_name: i.pos_category_id ? (catMap.get(i.pos_category_id)?.name ?? null) : null,
        network_status: i.network_status,
        origin: 'direct' as const,
      }))

    const recipeProds: PosProduct[] = recipes
      .filter(r => !r.is_internal && r.product !== null)
      .map(r => ({
        id: r.product!.id,
        name: r.title,
        price_ttc: r.product!.price * (1 + r.product!.tva_rate / 100),
        category_id: r.product!.category_id,
        category_name: r.product!.category_id ? (catMap.get(r.product!.category_id)?.name ?? null) : null,
        network_status: r.network_status,
        origin: 'recette' as const,
      }))

    return [...directs, ...recipeProds]
  }, [items, recipes, catMap])

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; color: string; items: PosProduct[] }>()
    const noCat: PosProduct[] = []

    for (const p of products) {
      if (!p.category_id) {
        noCat.push(p)
      } else {
        if (!map.has(p.category_id)) {
          const cat = catMap.get(p.category_id)
          map.set(p.category_id, {
            label: cat?.name ?? p.category_id,
            color: cat?.color_hex ?? '#475569',
            items: [],
          })
        }
        map.get(p.category_id)!.items.push(p)
      }
    }

    const groups = [...map.values()]
    if (noCat.length > 0) groups.push({ label: 'Sans catégorie', color: '#475569', items: noCat })
    return groups
  }, [products, catMap])

  if (products.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="text-3xl mb-3">🖥️</div>
        <div className="text-sm font-semibold text-[var(--text2)] mb-1">Aucun article en vente</div>
        <div className="text-xs text-[var(--text4)]">
          Activez la vente directe sur une marchandise ou publiez une recette pour la voir apparaître ici.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--text4)]">
        Aperçu en lecture seule · {products.length} article{products.length > 1 ? 's' : ''} en vente
      </p>
      {grouped.map(group => (
        <div key={group.label}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: group.color }} />
            <span className="text-xs font-bold uppercase tracking-wide text-[var(--text3)]">{group.label}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {group.items.map(p => (
              <div
                key={p.id}
                className="rounded-xl p-3 flex flex-col gap-1"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="text-sm font-semibold text-[var(--text1)] leading-tight">{p.name}</div>
                <div className="text-lg font-black tabular-nums" style={{ color: 'var(--green)' }}>
                  {p.price_ttc.toFixed(2)} €
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-[var(--text4)]">
                    {p.origin === 'direct' ? '🛒 Direct' : '🍳 Recette'}
                  </span>
                  {p.network_status !== 'not_shared' && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={
                        p.network_status === 'active'
                          ? { background: 'rgba(16,185,129,.1)', color: 'var(--green)' }
                          : p.network_status === 'coming_soon'
                          ? { background: 'rgba(168,85,247,.1)', color: '#d8b4fe' }
                          : { background: 'rgba(100,116,139,.1)', color: 'var(--text4)' }
                      }
                    >
                      {p.network_status === 'active' ? '● Actif' : p.network_status === 'coming_soon' ? '◑ Bientôt' : '○ Inactif'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
