'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { CatalogueItemForm } from './catalogue-item-form'

type CatalogItem = {
  id: string; type: string; name: string; description?: string
  is_mandatory: boolean; is_seasonal: boolean; expires_at?: string | null
  status: string; version: number
  network_catalog_item_data?: { payload: Record<string, unknown> }
}

export function CataloguePageClient({ initialItems }: { initialItems: unknown[] }) {
  const [items, setItems]       = useState<CatalogItem[]>(initialItems as CatalogItem[])
  const [tab, setTab]           = useState<'product' | 'recipe' | 'sop'>('product')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<CatalogItem | null>(null)

  const filtered = items.filter(i => i.type === tab)

  async function handlePublish(id: string) {
    const res = await fetch(`/api/franchise/catalogue/${id}/publish`, { method: 'POST' })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'published' } : i))
      toast.success('Item publié et propagé au réseau')
    } else {
      const d = await res.json()
      toast.error(d.error ?? 'Erreur')
    }
  }

  async function handleArchive(id: string) {
    const item = items.find(i => i.id === id)
    if (item?.is_mandatory && !confirm(`Cet item est obligatoire. L'archivage le désactivera chez tous les franchisés. Continuer ?`)) return
    const res = await fetch(`/api/franchise/catalogue/${id}/archive`, { method: 'POST' })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'archived' } : i))
      toast.success('Item archivé')
    } else {
      toast.error('Erreur lors de l\'archivage')
    }
  }

  function onSaved(item: CatalogItem) {
    setItems(prev => {
      const exists = prev.find(i => i.id === item.id)
      return exists ? prev.map(i => i.id === item.id ? item : i) : [item, ...prev]
    })
    setShowForm(false); setEditItem(null)
  }

  const tabStyle = (active: boolean) => ({
    padding: '6px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
    background: active ? 'var(--surface2)' : 'transparent',
    color: active ? 'var(--text1)' : 'var(--text3)',
    border: 'none',
  } as React.CSSProperties)

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      draft:     { bg: '#1a1a2e', color: '#94a3b8', label: 'DRAFT' },
      published: { bg: '#0f2010', color: '#4ade80', label: 'PUBLIÉ' },
      archived:  { bg: '#1a1010', color: '#f87171', label: 'ARCHIVÉ' },
    }
    const s = map[status] ?? map.draft
    return (
      <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
        {s.label}
      </span>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text1)]">Catalogue réseau</h1>
          <p className="text-sm text-[var(--text4)] mt-0.5">Gérez les produits, recettes et SOPs partagés avec vos franchisés</p>
        </div>
        <button
          onClick={() => { setEditItem(null); setShowForm(true) }}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: 'var(--blue)' }}
        >
          + Nouvel item
        </button>
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-lg" style={{ background: 'var(--surface)' }}>
        {(['product', 'recipe', 'sop'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
            {t === 'product' ? '🛍 Produits' : t === 'recipe' ? '📋 Recettes' : '📖 SOPs'}
          </button>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-[var(--text4)]">
            Aucun item dans cette catégorie
          </div>
        )}
        {filtered.map((item, i) => (
          <div
            key={item.id}
            className="flex items-center justify-between px-4 py-3 gap-4"
            style={{ background: 'var(--surface)', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div>
                <p className="text-sm font-medium text-[var(--text1)]">{item.name}</p>
                {item.description && <p className="text-xs text-[var(--text4)] truncate">{item.description}</p>}
              </div>
              {statusBadge(item.status)}
              {item.is_mandatory && (
                <span style={{ background: '#1a1530', color: '#a78bfa', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>OBLIGATOIRE</span>
              )}
              {item.is_seasonal && (
                <span style={{ background: '#1a1200', color: '#fbbf24', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                  SAISONNIER{item.expires_at ? ` · ${new Date(item.expires_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}` : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => { setEditItem(item); setShowForm(true) }}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--surface2)', color: 'var(--text3)', border: '1px solid var(--border)' }}>
                Éditer
              </button>
              {item.status === 'draft' && (
                <button onClick={() => handlePublish(item.id)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                  style={{ background: 'var(--blue)' }}>
                  Publier
                </button>
              )}
              {item.status !== 'archived' && (
                <button onClick={() => handleArchive(item.id)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: '#1a1010', color: '#f87171', border: '1px solid #3a1010' }}>
                  Archiver
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <CatalogueItemForm
          item={editItem}
          defaultType={tab}
          onClose={() => { setShowForm(false); setEditItem(null) }}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
