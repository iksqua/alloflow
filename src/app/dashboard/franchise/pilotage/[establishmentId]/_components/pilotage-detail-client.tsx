'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { Product, Category } from '@/app/dashboard/products/_components/types'
import type { StockItem, PurchaseOrder } from '@/app/dashboard/stocks/_components/types'
import type { Recipe } from '@/app/dashboard/recettes/_components/types'

type Tab = 'produits' | 'stocks' | 'recettes'

interface NamedCategory { id: string; name: string; color_hex: string }

interface Props {
  establishmentId: string
  establishmentName: string
  initialProducts: Product[]
  initialCategories: Category[]
  initialItems: StockItem[]
  initialOrders: PurchaseOrder[]
  stockCategories: NamedCategory[]
  initialRecipes: Recipe[]
  recipeCategories: (NamedCategory & { icon?: string | null })[]
}

export function PilotageDetailClient({
  establishmentId,
  establishmentName,
  initialProducts,
  initialCategories,
  initialItems,
  initialRecipes,
}: Props) {
  const [tab, setTab] = useState<Tab>('produits')

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'produits',  label: 'Produits',  count: initialProducts.length },
    { id: 'stocks',    label: 'Stocks',    count: initialItems.length },
    { id: 'recettes',  label: 'Recettes',  count: initialRecipes.length },
  ]

  const catMap = new Map(initialCategories.map(c => [c.id, c.name]))

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/dashboard/franchise/pilotage"
          className="text-sm text-[var(--text4)] hover:text-[var(--text2)] transition-colors"
        >
          ← Pilotage
        </Link>
        <span className="text-[var(--text4)]">/</span>
        <div>
          <h1 className="text-xl font-bold text-[var(--text1)]">{establishmentName}</h1>
          <p className="text-xs text-[var(--text4)] mt-0.5">Vue en lecture depuis le siège</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--surface2)' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all"
            style={tab === t.id
              ? { background: 'var(--surface)', color: 'var(--text1)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }
              : { color: 'var(--text3)' }}
          >
            {t.label}
            <span className="ml-1.5 text-xs opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* Produits tab */}
      {tab === 'produits' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="grid px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
            style={{ gridTemplateColumns: '2fr 1fr 1fr 80px 80px', gap: '8px', background: 'var(--surface2)', color: 'var(--text4)' }}>
            <span>Produit</span><span>Catégorie</span><span>Prix TTC</span><span>TVA</span><span>Statut</span>
          </div>
          {initialProducts.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-[var(--text4)]" style={{ background: 'var(--surface)' }}>
              Aucun produit
            </div>
          )}
          {initialProducts.map((p, i) => (
            <div key={p.id} className="grid items-center px-4 py-3"
              style={{ gridTemplateColumns: '2fr 1fr 1fr 80px 80px', gap: '8px', background: 'var(--surface)', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div className="flex items-center gap-2 min-w-0">
                {p.emoji && <span className="text-base flex-shrink-0">{p.emoji}</span>}
                <span className="text-sm font-medium text-[var(--text1)] truncate">{p.name}</span>
              </div>
              <span className="text-xs text-[var(--text3)]">{p.category_id ? (catMap.get(p.category_id) ?? '—') : '—'}</span>
              <span className="text-sm font-bold tabular-nums text-[var(--text1)]">
                {(p.price * (1 + p.tva_rate / 100)).toFixed(2)} €
              </span>
              <span className="text-xs text-[var(--text4)]">{p.tva_rate}%</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.is_active ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'}`}>
                {p.is_active ? 'Actif' : 'Inactif'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Stocks tab */}
      {tab === 'stocks' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="grid px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
            style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', gap: '8px', background: 'var(--surface2)', color: 'var(--text4)' }}>
            <span>Article</span><span>Catégorie</span><span>Quantité</span><span>Seuil alerte</span><span>Statut</span>
          </div>
          {initialItems.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-[var(--text4)]" style={{ background: 'var(--surface)' }}>
              Aucun article en stock
            </div>
          )}
          {initialItems.map((item, i) => {
            const alertColor = item.quantity <= 0 ? 'text-red-400 bg-red-900/20'
              : item.quantity <= item.alert_threshold ? 'text-amber-400 bg-amber-900/20'
              : 'text-green-400 bg-green-900/20'
            const alertLabel = item.quantity <= 0 ? 'Rupture' : item.quantity <= item.alert_threshold ? 'Alerte' : 'OK'
            return (
              <div key={item.id} className="grid items-center px-4 py-3"
                style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 80px', gap: '8px', background: 'var(--surface)', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <span className="text-sm font-medium text-[var(--text1)] truncate">{item.name}</span>
                <span className="text-xs text-[var(--text3)]">{item.category ?? '—'}</span>
                <span className="text-sm tabular-nums text-[var(--text1)]">{item.quantity} {item.unit}</span>
                <span className="text-sm tabular-nums text-[var(--text3)]">{item.alert_threshold} {item.unit}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${alertColor}`}>{alertLabel}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Recettes tab */}
      {tab === 'recettes' && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="grid px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
            style={{ gridTemplateColumns: '2fr 1fr 1fr 80px', gap: '8px', background: 'var(--surface2)', color: 'var(--text4)' }}>
            <span>Recette</span><span>Catégorie</span><span>Ingrédients</span><span>Type</span>
          </div>
          {initialRecipes.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-[var(--text4)]" style={{ background: 'var(--surface)' }}>
              Aucune recette
            </div>
          )}
          {initialRecipes.map((recipe, i) => (
            <div key={recipe.id} className="grid items-center px-4 py-3"
              style={{ gridTemplateColumns: '2fr 1fr 1fr 80px', gap: '8px', background: 'var(--surface)', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <span className="text-sm font-medium text-[var(--text1)] truncate">{recipe.title}</span>
              <span className="text-xs text-[var(--text3)]">{recipe.category ?? '—'}</span>
              <span className="text-xs text-[var(--text4)]">{recipe.ingredients?.length ?? 0} ingrédient{(recipe.ingredients?.length ?? 0) > 1 ? 's' : ''}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${recipe.is_internal ? 'text-[var(--text4)] bg-[var(--surface2)]' : 'text-blue-400 bg-blue-900/20'}`}>
                {recipe.is_internal ? 'Interne' : 'POS'}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--text4)] mt-4 text-center">
        Vue en lecture seule — ID établissement : {establishmentId}
      </p>
    </div>
  )
}
