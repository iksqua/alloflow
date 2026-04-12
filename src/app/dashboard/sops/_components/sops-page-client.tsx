'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Sop, SopCategory, SopWithSteps } from './types'
import { SopForm } from './sop-form'
import { SopKitchenMode } from './sop-kitchen-mode'
import { SopCategoryManager } from './sop-category-manager'

interface Props {
  initialSops: Sop[]
  initialCategories: SopCategory[]
  recipes: { id: string; title: string }[]
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}min${s > 0 ? ` ${s}s` : ''}` : `${s}s`
}

export function SopsPageClient({ initialSops, initialCategories, recipes }: Props) {
  const [sops,       setSops]       = useState(initialSops)
  const [categories, setCategories] = useState(initialCategories)
  const [catFilter,  setCatFilter]  = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [showForm,   setShowForm]   = useState(false)
  const [editingSop, setEditingSop] = useState<SopWithSteps | null>(null)
  const [kitchenSop, setKitchenSop] = useState<SopWithSteps | null>(null)
  const [showCatMgr, setShowCatMgr] = useState(false)

  const filtered = sops.filter(s => {
    if (catFilter && s.category_id !== catFilter) return false
    if (search && !s.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  async function reloadSops() {
    const res = await fetch('/api/sops')
    const json = await res.json()
    setSops(json.sops ?? [])
  }

  async function reloadCategories() {
    const res = await fetch('/api/sop-categories')
    const json = await res.json()
    setCategories(json.categories ?? [])
  }

  async function openKitchenMode(sop: Sop) {
    const res = await fetch(`/api/sops/${sop.id}/steps`)
    if (!res.ok) { toast.error('Erreur lors du chargement des étapes'); return }
    const json = await res.json()
    setKitchenSop({ ...sop, steps: json.steps ?? [] })
  }

  async function openEditForm(sop: Sop) {
    const res = await fetch(`/api/sops/${sop.id}/steps`)
    if (!res.ok) { toast.error('Erreur lors du chargement du guide'); return }
    const json = await res.json()
    setEditingSop({ ...sop, steps: json.steps ?? [] })
    setShowForm(true)
  }

  async function handleDelete(id: string) {
    if (!confirm('Supprimer ce guide ?')) return
    const res = await fetch(`/api/sops/${id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error('Erreur lors de la suppression'); return }
    toast.success('Guide supprimé')
    await reloadSops()
  }

  return (
    <div>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text1)]">Guides</h1>
            <p className="text-xs text-[var(--text4)] mt-0.5">{sops.length} guide{sops.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setShowCatMgr(true)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text3)] hover:bg-[var(--surface)]">
              ⚙️ Catégories
            </button>
            <button onClick={() => { setEditingSop(null); setShowForm(true) }}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: 'var(--blue)' }}>
              + Nouveau guide
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher..."
            className="px-3 py-1.5 rounded-lg text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] w-full sm:w-52" />
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setCatFilter(null)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${catFilter === null ? 'text-white' : 'text-[var(--text3)] hover:bg-[var(--surface)]'}`}
              style={{ background: catFilter === null ? 'var(--blue)' : undefined }}>
              Tous ({sops.length})
            </button>
            {categories.map(cat => {
              const count = sops.filter(s => s.category_id === cat.id).length
              return (
                <button key={cat.id} onClick={() => setCatFilter(catFilter === cat.id ? null : cat.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${catFilter === cat.id ? 'text-white' : 'text-[var(--text3)] hover:bg-[var(--surface)]'}`}
                  style={{ background: catFilter === cat.id ? 'var(--blue)' : undefined }}>
                  {cat.emoji} {cat.name} ({count})
                </button>
              )
            })}
          </div>
        </div>

        {/* SOP list */}
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📋</div>
            <div className="font-semibold text-[var(--text2)]">Aucun guide</div>
            <div className="text-sm text-[var(--text4)] mt-1">Créez votre premier guide opérationnel</div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(sop => (
              <div key={sop.id} className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[var(--border)] hover:border-[var(--blue)]/30 transition-colors" style={{ background: 'var(--surface)' }}>
                {/* Category emoji */}
                <div className="text-xl flex-shrink-0 w-8 text-center">
                  {sop.category?.emoji ?? '📋'}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[var(--text1)] truncate">{sop.title}</span>
                    {sop.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[var(--surface2)] text-[var(--text4)]">
                        {sop.category.name}
                      </span>
                    )}
                    {sop.recipe && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-900/20 text-blue-400">
                        📖 {sop.recipe.title}
                      </span>
                    )}
                    {sop.has_video && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-900/20 text-purple-400">▶ Vidéo</span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--text4)] mt-0.5">
                    {sop.step_count} étape{sop.step_count !== 1 ? 's' : ''}
                    {sop.total_duration_seconds > 0 && ` · ${formatDuration(sop.total_duration_seconds)}`}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openKitchenMode(sop)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] hidden sm:block">
                    ▶ Mode cuisine
                  </button>
                  <button onClick={() => openKitchenMode(sop)}
                    className="w-7 h-7 rounded flex items-center justify-center border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] sm:hidden"
                    title="Mode cuisine">
                    ▶
                  </button>
                  <button onClick={() => openEditForm(sop)}
                    className="w-7 h-7 rounded flex items-center justify-center text-[var(--text4)] hover:text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
                    title="Modifier">
                    ✏️
                  </button>
                  <button onClick={() => handleDelete(sop.id)}
                    className="w-7 h-7 rounded flex items-center justify-center text-red-500/60 hover:text-red-400 hover:bg-[var(--red-bg)] transition-colors"
                    title="Supprimer">🗑️</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SopForm
        open={showForm}
        sop={editingSop}
        categories={categories}
        recipes={recipes}
        onClose={() => setShowForm(false)}
        onSave={async () => { setShowForm(false); await reloadSops() }}
      />

      {kitchenSop && (
        <SopKitchenMode
          sop={kitchenSop}
          onClose={() => setKitchenSop(null)}
        />
      )}

      <SopCategoryManager
        open={showCatMgr}
        categories={categories}
        onClose={() => setShowCatMgr(false)}
        onSave={async () => { await reloadCategories() }}
      />
    </div>
  )
}
