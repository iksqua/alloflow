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

const STATUS_CLASSES: Record<string, string> = {
  draft:     'bg-slate-800/60 text-slate-400',
  published: 'bg-green-900/20 text-green-400',
  archived:  'bg-red-900/20 text-red-400',
}
const STATUS_LABELS: Record<string, string> = {
  draft: 'DRAFT', published: 'PUBLIÉ', archived: 'ARCHIVÉ',
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '6px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
  background: active ? 'var(--surface2)' : 'transparent',
  color: active ? 'var(--text1)' : 'var(--text3)', border: 'none',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.2)' : undefined,
})

export function CataloguePageClient({ initialItems }: { initialItems: unknown[] }) {
  const [items, setItems]       = useState<CatalogItem[]>(initialItems as CatalogItem[])
  const [tab, setTab]           = useState<'product' | 'recipe' | 'sop' | 'ingredient'>('product')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<CatalogItem | null>(null)
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)

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

  async function handleDuplicate(id: string) {
    if (duplicatingId) return
    setDuplicatingId(id)
    try {
      const res = await fetch(`/api/franchise/catalogue/${id}/duplicate`, { method: 'POST' })
      if (res.ok) {
        const d = await res.json()
        setItems(prev => [d.item, ...prev])
        toast.success('Item dupliqué — modifiez-le avant de publier')
      } else {
        const d = await res.json()
        toast.error(d.error ?? 'Erreur lors de la duplication')
      }
    } finally {
      setDuplicatingId(null)
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

  return (
    <div className="max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text1)]">Catalogue réseau</h1>
          <p className="text-sm text-[var(--text4)] mt-0.5">Gérez les produits, recettes et SOPs partagés avec vos franchisés</p>
        </div>
        <button
          onClick={() => { setEditItem(null); setShowForm(true) }}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white flex-shrink-0"
          style={{ background: 'var(--blue)' }}
        >
          + Nouvel item
        </button>
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
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <div>
                <p className="text-sm font-medium text-[var(--text1)]">{item.name}</p>
                {item.description && <p className="text-xs text-[var(--text4)] truncate">{item.description}</p>}
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_CLASSES[item.status] ?? STATUS_CLASSES.draft}`}>
                {STATUS_LABELS[item.status] ?? 'DRAFT'}
              </span>
              {item.is_mandatory && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-900/20 text-purple-400">OBLIGATOIRE</span>
              )}
              {item.is_seasonal && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-900/20 text-amber-400">
                  SAISONNIER{item.expires_at ? ` · ${new Date(item.expires_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}` : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => { setEditItem(item); setShowForm(true) }}
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text3)]"
                style={{ background: 'var(--surface2)' }}>
                Éditer
              </button>
              <button
                onClick={() => handleDuplicate(item.id)}
                disabled={duplicatingId === item.id}
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text3)] disabled:opacity-50"
                style={{ background: 'var(--surface2)' }}>
                {duplicatingId === item.id ? '…' : '⎘ Dupliquer'}
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
                  className="text-xs px-3 py-1.5 rounded-lg font-medium border border-red-900/30 bg-red-900/20 text-red-400">
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
