'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { hasUnseenNotifications } from '@/lib/catalogue-helpers'
import { SopKitchenViewer } from './sop-kitchen-viewer'

const HIDDEN_PAYLOAD_KEYS = ['reference_package_price', 'reference_package_size']

function filterPayloadForDisplay(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([k]) => !HIDDEN_PAYLOAD_KEYS.includes(k))
  )
}

type NetworkCatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  available_from?: string | null; status: string; version: number
  network_catalog_item_data?: { payload: Record<string, unknown>; previous_payload: Record<string, unknown> | null } | null
  image_url?: string | null
}

type EstablishmentCatalogItem = {
  id: string; is_active: boolean; local_price: number | null; local_stock_threshold: number | null
  current_version: number; notified_at: string | null; seen_at: string | null
  is_upcoming: boolean
  network_catalog_items: NetworkCatalogItem | null
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
  background: active ? 'var(--surface2)' : 'transparent',
  color: active ? 'var(--text1)' : 'var(--text3)', border: 'none',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.2)' : undefined,
})

function ItemThumbnail({ src }: { src?: string | null }) {
  const [err, setErr] = useState(false)
  if (src && !err) {
    return (
      <img src={src} alt="" onError={() => setErr(true)}
        className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
    )
  }
  return (
    <div className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-lg"
      style={{ background: 'var(--surface2)', color: 'var(--text4)' }}>
      📷
    </div>
  )
}

export function CatalogueReseauPageClient({ initialItems }: { initialItems: unknown[] }) {
  const [items, setItems] = useState<EstablishmentCatalogItem[]>(initialItems as EstablishmentCatalogItem[])
  const [tab, setTab]     = useState<'product' | 'recipe' | 'sop' | 'ingredient'>('product')
  const [feedbackOpen,   setFeedbackOpen]   = useState<string | null>(null)
  const [feedbackText,   setFeedbackText]   = useState('')
  const [feedbackSent,   setFeedbackSent]   = useState<Set<string>>(() => new Set())
  const [feedbackSaving, setFeedbackSaving] = useState(false)

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

  async function handleSendFeedback(catalogItemId: string, eciId: string) {
    if (!feedbackText.trim()) return
    setFeedbackSaving(true)
    try {
      const res = await fetch(`/api/catalogue-reseau/${catalogItemId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: feedbackText.trim() }),
      })
      if (res.ok) {
        setFeedbackSent(prev => new Set([...prev, eciId]))
        setFeedbackOpen(null)
        setFeedbackText('')
        toast.success('Retour envoyé')
      } else {
        const d = await res.json()
        toast.error(d.error ?? 'Impossible d\'envoyer le retour')
      }
    } finally {
      setFeedbackSaving(false)
    }
  }

  function formatDate(d: string) {
    if (!d) return '?'
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--text1)]">Catalogue réseau</h1>
        <p className="text-sm text-[var(--text4)] mt-0.5">Éléments partagés par le siège</p>
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'var(--surface)' }}>
        {(['product', 'recipe', 'sop', 'ingredient'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t === 'product' ? '🛍 Produits' : t === 'recipe' ? '📋 Recettes' : t === 'sop' ? '📖 SOPs' : '🥕 Ingrédients'}
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

          return (
            <div key={eci.id} className="px-4 py-3" style={{ background: 'var(--surface)', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <ItemThumbnail src={cat.image_url} />
                  <div>
                    <p className="text-sm font-medium text-[var(--text1)]">{cat.name}</p>
                    {cat.type === 'ingredient' && cat.network_catalog_item_data?.payload?.unit != null && (
                      <p className="text-xs text-[var(--text4)]">{String(cat.network_catalog_item_data.payload.unit)}{cat.network_catalog_item_data.payload.category ? ` · ${String(cat.network_catalog_item_data.payload.category)}` : ''}</p>
                    )}
                    {cat.type === 'ingredient' && (() => {
                      const p = cat.network_catalog_item_data?.payload as Record<string, unknown> | undefined
                      const price = p?.reference_package_price as number | undefined
                      const size  = p?.reference_package_size  as number | undefined
                      if (!price || !size) return null
                      return (
                        <p className="text-xs text-[var(--text4)] mt-0.5">
                          Réf. siège : {(price / size).toFixed(4)} €/{p?.unit as string}
                        </p>
                      )
                    })()}
                    {cat.description && cat.type !== 'ingredient' && <p className="text-xs text-[var(--text4)]">{cat.description}</p>}
                  </div>
                  {cat.is_mandatory && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-900/20 text-purple-400">OBLIGATOIRE</span>
                  )}
                  {cat.is_seasonal && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-900/20 text-amber-400">
                      SAISONNIER{cat.expires_at ? ` · ${formatDate(cat.expires_at)}` : ''}
                    </span>
                  )}
                  {eci.is_upcoming && cat.available_from && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-900/20 text-blue-400">
                      PROCHAINEMENT · {formatDate(cat.available_from)}
                    </span>
                  )}
                  {!eci.is_upcoming && isNew     && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-900/20 text-green-400">NOUVEAU</span>}
                  {!eci.is_upcoming && isUpdated && <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-900/20 text-amber-400">MIS À JOUR</span>}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* SOP viewer button */}
                  {cat.type === 'sop' && cat.network_catalog_item_data?.payload && !eci.is_upcoming && (
                    <SopKitchenViewer
                      id={cat.id}
                      name={cat.name}
                      payload={cat.network_catalog_item_data.payload}
                    />
                  )}
                  {cat.type === 'sop' && eci.is_upcoming && (
                    <button disabled className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text4)]"
                      style={{ background: 'var(--surface2)' }}
                      title={cat.available_from ? `Disponible le ${formatDate(cat.available_from)}` : 'Bientôt disponible'}>
                      ▶ Bientôt
                    </button>
                  )}

                  {/* Toggle actif/inactif — not for ingredients, not for upcoming items */}
                  {cat.type !== 'ingredient' && !cat.is_mandatory && !eci.is_upcoming && (
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
                  {eci.is_upcoming && cat.type !== 'sop' && (
                    <span className="text-xs text-[var(--text4)]" title={`Disponible le ${cat.available_from ? formatDate(cat.available_from) : '?'}`}>
                      Disponible le {cat.available_from ? formatDate(cat.available_from) : '?'}
                    </span>
                  )}
                </div>
              </div>

              {/* Diff AVANT/APRÈS — only for updated, non-upcoming items */}
              {!eci.is_upcoming && isUpdated && cat.network_catalog_item_data?.previous_payload && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3 bg-red-900/10 border border-red-900/20">
                    <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1">Avant</p>
                    <pre className="text-xs text-[var(--text3)] whitespace-pre-wrap">
                      {JSON.stringify(filterPayloadForDisplay(cat.network_catalog_item_data.previous_payload ?? {}), null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-lg p-3 bg-green-900/10 border border-green-900/20">
                    <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1">Après</p>
                    <pre className="text-xs text-[var(--text3)] whitespace-pre-wrap">
                      {JSON.stringify(filterPayloadForDisplay(cat.network_catalog_item_data.payload ?? {}), null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Feedback franchisé → siège */}
              {!eci.is_upcoming && (
                <div className="mt-2">
                  {feedbackSent.has(eci.id) ? (
                    <span className="text-xs text-[var(--text4)]">✓ Retour envoyé</span>
                  ) : feedbackOpen === eci.id ? (
                    <div className="mt-2 rounded-lg p-3" style={{ background: 'var(--surface2)' }}>
                      <textarea
                        value={feedbackText}
                        onChange={e => setFeedbackText(e.target.value)}
                        placeholder="Ex: ingrédient difficile à trouver, fournisseur souvent en rupture…"
                        maxLength={1000}
                        rows={2}
                        className="w-full bg-transparent border-none outline-none text-xs resize-none"
                        style={{ color: 'var(--text2)', fontFamily: 'inherit' }}
                      />
                      <div className="flex justify-between items-center mt-2">
                        <button
                          onClick={() => { setFeedbackOpen(null); setFeedbackText('') }}
                          className="text-xs text-[var(--text4)]">
                          Annuler
                        </button>
                        <button
                          onClick={() => handleSendFeedback(cat.id, eci.id)}
                          disabled={feedbackSaving || !feedbackText.trim()}
                          className="text-xs px-3 py-1 rounded-lg text-white font-medium"
                          style={{ background: 'var(--blue)', opacity: (feedbackSaving || !feedbackText.trim()) ? 0.5 : 1 }}>
                          {feedbackSaving ? 'Envoi…' : 'Envoyer'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setFeedbackOpen(eci.id); setFeedbackText('') }}
                      className="text-xs text-[var(--text4)] underline">
                      + Laisser un retour
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
