'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { hasUnseenNotifications } from '@/lib/catalogue-helpers'

type NetworkCatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  status: string; version: number
  network_catalog_item_data?: { payload: Record<string, unknown>; previous_payload: Record<string, unknown> | null } | null
}

type EstablishmentCatalogItem = {
  id: string; is_active: boolean; local_price: number | null; local_stock_threshold: number | null
  current_version: number; notified_at: string | null; seen_at: string | null
  network_catalog_items: NetworkCatalogItem | null
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
  background: active ? 'var(--surface2)' : 'transparent',
  color: active ? 'var(--text1)' : 'var(--text3)', border: 'none',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.2)' : undefined,
})

export function CatalogueReseauPageClient({ initialItems }: { initialItems: unknown[] }) {
  const [items, setItems] = useState<EstablishmentCatalogItem[]>(initialItems as EstablishmentCatalogItem[])
  const [tab, setTab]     = useState<'product' | 'recipe' | 'sop'>('product')

  const filtered = items.filter(i => i.network_catalog_items?.type === tab)

  useEffect(() => {
    const unseen = items.filter(i => hasUnseenNotifications(i.notified_at, i.seen_at))
    unseen.forEach(i => {
      fetch(`/api/catalogue-reseau/${i.id}/seen`, { method: 'POST' }).catch(() => null)
    })
    if (unseen.length > 0) {
      setItems(prev => prev.map(i => ({ ...i, seen_at: new Date().toISOString() })))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(id: string, is_active: boolean) {
    const res = await fetch(`/api/catalogue-reseau/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, is_active } : i))
      toast.success(is_active ? 'Item activé' : 'Item désactivé')
    } else {
      const d = await res.json()
      toast.error(d.error ?? 'Erreur')
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Catalogue réseau</h1>
        <p className="text-sm text-[var(--text4)] mt-0.5">Éléments partagés par le siège</p>
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'var(--surface)' }}>
        {(['product', 'recipe', 'sop'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t === 'product' ? '🛍 Produits' : t === 'recipe' ? '📋 Recettes' : '📖 SOPs'}
          </button>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--text4)]">Aucun item dans cette catégorie</div>
        )}
        {filtered.map((eci, i) => {
          const cat = eci.network_catalog_items
          if (!cat) return null
          const isNew     = eci.current_version === 1 && !eci.seen_at
          const isUpdated = eci.current_version < cat.version
          const hasDiff   = isUpdated && cat.network_catalog_item_data?.previous_payload

          return (
            <div key={eci.id} className="px-4 py-3" style={{ background: 'var(--surface)', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <div>
                    <p className="text-sm font-medium text-[var(--text1)]">{cat.name}</p>
                    {cat.description && <p className="text-xs text-[var(--text4)]">{cat.description}</p>}
                  </div>
                  {cat.is_mandatory && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-900/20 text-purple-400">OBLIGATOIRE</span>
                  )}
                  {cat.is_seasonal && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-900/20 text-amber-400">
                      SAISONNIER{cat.expires_at ? ` · ${new Date(cat.expires_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}` : ''}
                    </span>
                  )}
                  {isNew     && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-900/20 text-green-400">NOUVEAU</span>}
                  {isUpdated && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-900/20 text-amber-400">MIS À JOUR</span>}
                </div>
                {!cat.is_mandatory && (
                  <button
                    onClick={() => handleToggle(eci.id, !eci.is_active)}
                    className={`text-xs px-3 py-1.5 rounded-lg flex-shrink-0 font-medium border ${
                      eci.is_active
                        ? 'bg-green-900/20 text-green-400 border-green-900/30'
                        : 'border-[var(--border)] text-[var(--text3)]'
                    }`}
                    style={eci.is_active ? {} : { background: 'var(--surface2)' }}
                  >
                    {eci.is_active ? 'Actif' : 'Inactif'}
                  </button>
                )}
              </div>

              {hasDiff && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3 bg-red-900/10 border border-red-900/20">
                    <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1">Avant</p>
                    <pre className="text-xs text-[var(--text3)] whitespace-pre-wrap">
                      {JSON.stringify(cat.network_catalog_item_data!.previous_payload, null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-lg p-3 bg-green-900/10 border border-green-900/20">
                    <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1">Après</p>
                    <pre className="text-xs text-[var(--text3)] whitespace-pre-wrap">
                      {JSON.stringify(cat.network_catalog_item_data!.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
