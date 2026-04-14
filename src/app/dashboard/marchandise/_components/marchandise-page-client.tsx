// src/app/dashboard/marchandise/_components/marchandise-page-client.tsx
'use client'
import { useState } from 'react'
import type { MarchandiseItem, RecipeRow, PosCategory } from './types'

// Tabs imported — these files don't exist yet, TypeScript errors are expected
import { TabMarchandise } from './tab-marchandise'
import { TabRecettes } from './tab-recettes'
import { TabEnVente } from './tab-en-vente'
import { TabApercuCaisse } from './tab-apercu-caisse'

type Tab = 'marchandise' | 'recettes' | 'en-vente' | 'apercu-caisse'

interface Props {
  initialItems: MarchandiseItem[]
  initialRecipes: RecipeRow[]
  categories: PosCategory[]
  establishmentId: string
  initialTab: string
}

export function MarchandisePageClient({
  initialItems,
  initialRecipes,
  categories,
  establishmentId,
  initialTab,
}: Props) {
  const [items, setItems] = useState(initialItems)
  const [recipes, setRecipes] = useState(initialRecipes)
  const [tab, setTab] = useState<Tab>(
    (['marchandise', 'recettes', 'en-vente', 'apercu-caisse'] as const).includes(initialTab as Tab)
      ? (initialTab as Tab)
      : 'marchandise'
  )

  // KPIs
  const directCount = items.filter(i => i.is_pos).length
  const recipeProductCount = recipes.filter(r => !r.is_internal).length
  const enVenteCount = directCount + recipeProductCount
  const activeRecipesWithFC = recipes.filter(r => r.food_cost_pct !== null)
  const avgFoodCost = activeRecipesWithFC.length > 0
    ? Math.round(activeRecipesWithFC.reduce((s, r) => s + (r.food_cost_pct ?? 0), 0) / activeRecipesWithFC.length * 10) / 10
    : null
  const sharedCount = [
    ...items.filter(i => i.network_status === 'active'),
    ...recipes.filter(r => r.network_status === 'active'),
  ].length
  const comingSoonCount = [
    ...items.filter(i => i.network_status === 'coming_soon'),
    ...recipes.filter(r => r.network_status === 'coming_soon'),
  ].length

  const TABS: { id: Tab; label: string; count?: number }[] = [
    { id: 'marchandise',    label: '📦 Marchandise',    count: items.length },
    { id: 'recettes',      label: '🍳 Recettes',       count: recipes.length },
    { id: 'en-vente',      label: '🛒 En vente',       count: enVenteCount },
    { id: 'apercu-caisse', label: '🖥️ Aperçu caisse' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[var(--text1)]">Marchandise</h1>
          <p className="text-xs text-[var(--text4)] mt-1">Achats · Recettes · Articles en vente</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text4)] mb-2">Marchandises</div>
          <div className="text-3xl font-black text-[var(--text1)]">{items.length}</div>
          <div className="text-xs text-[var(--text4)] mt-1">matières achetées</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text4)] mb-2">Articles en vente</div>
          <div className="text-3xl font-black" style={{ color: 'var(--blue)' }}>{enVenteCount}</div>
          <div className="text-xs text-[var(--text4)] mt-1">{directCount} directs + {recipeProductCount} recettes</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text4)] mb-2">Food cost moyen</div>
          <div className="text-3xl font-black" style={{ color: avgFoodCost !== null && avgFoodCost < 30 ? 'var(--green)' : 'var(--orange)' }}>
            {avgFoodCost !== null ? `${avgFoodCost}%` : '—'}
          </div>
          <div className="text-xs text-[var(--text4)] mt-1">Sur recettes actives</div>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text4)] mb-2">Partagés réseau</div>
          <div className="text-3xl font-black" style={{ color: '#d8b4fe' }}>{sharedCount}</div>
          <div className="text-xs text-[var(--text4)] mt-1">{comingSoonCount > 0 ? `${comingSoonCount} prochainement` : 'actifs'}</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'var(--surface)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={[
              'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
              tab === t.id ? 'text-[var(--text1)]' : 'text-[var(--text4)] hover:text-[var(--text2)]',
            ].join(' ')}
            style={tab === t.id ? { background: 'var(--bg)', boxShadow: '0 1px 3px rgba(0,0,0,.2)' } : undefined}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="ml-1.5 opacity-50 text-[11px]">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'marchandise' && (
        <TabMarchandise
          items={items}
          categories={categories}
          establishmentId={establishmentId}
          onItemsChange={setItems}
        />
      )}
      {tab === 'recettes' && (
        <TabRecettes
          recipes={recipes}
          categories={categories}
          establishmentId={establishmentId}
          onRecipesChange={setRecipes}
        />
      )}
      {tab === 'en-vente' && (
        <TabEnVente
          items={items}
          recipes={recipes}
          categories={categories}
          establishmentId={establishmentId}
        />
      )}
      {tab === 'apercu-caisse' && (
        <TabApercuCaisse
          items={items}
          recipes={recipes}
          categories={categories}
        />
      )}
    </div>
  )
}
