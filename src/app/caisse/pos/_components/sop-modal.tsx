'use client'
import { useState, useEffect } from 'react'
import { SopKitchenMode } from '@/app/dashboard/sops/_components/sop-kitchen-mode'
import type { SopWithSteps } from '@/app/dashboard/sops/_components/types'

interface SopModalProps {
  establishmentId: string  // reçu pour cohérence structurelle — NON transmis à l'API (dérive depuis la session)
  onClose: () => void
}

export function SopModal({ establishmentId: _establishmentId, onClose }: SopModalProps) {
  const [sops, setSops] = useState<SopWithSteps[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [selectedSop, setSelectedSop] = useState<SopWithSteps | null>(null)

  useEffect(() => {
    fetch('/api/sops')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setSops(data.sops ?? [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Dériver les catégories uniques depuis les SOPs chargées
  const categories = Array.from(
    new Map(
      sops
        .filter(s => s.category)
        .map(s => [s.category!.id, s.category!])
    ).values()
  )

  const filtered = sops.filter(s => {
    const matchSearch = search === '' || s.title.toLowerCase().includes(search.toLowerCase())
    const matchCat = selectedCategoryId === null || s.category_id === selectedCategoryId
    return matchSearch && matchCat
  })

  function formatDuration(seconds: number) {
    const m = Math.ceil(seconds / 60)
    return m <= 1 ? '1 min' : `${m} min`
  }

  // SopKitchenMode est fixed inset-0 z-[100] — s'affiche nativement par-dessus cette modal (z-50)
  if (selectedSop) {
    return <SopKitchenMode sop={selectedSop} onClose={() => setSelectedSop(null)} />
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-0">
      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.7)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-2xl mt-16 rounded-2xl flex flex-col"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          maxHeight: '85vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-sm font-semibold text-[var(--text1)]">📋 Procédures</span>
          <button
            onClick={onClose}
            className="text-xs text-[var(--text4)] hover:text-[var(--text1)] transition-colors"
          >
            ✕ Fermer
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Barre de recherche */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher une procédure…"
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              color: 'var(--text1)',
              outline: 'none',
            }}
          />

          {/* Chips catégories */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedCategoryId(null)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={
                  selectedCategoryId === null
                    ? { background: 'var(--blue)', color: 'white' }
                    : { background: 'var(--surface2)', color: 'var(--text3)' }
                }
              >
                Tous
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                  style={
                    selectedCategoryId === cat.id
                      ? { background: 'var(--blue)', color: 'white' }
                      : { background: 'var(--surface2)', color: 'var(--text3)' }
                  }
                >
                  {cat.emoji} {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* États */}
          {loading && (
            <div className="flex items-center justify-center py-12 text-sm text-[var(--text4)]">
              Chargement…
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <p className="text-sm text-[var(--red)]">{error}</p>
              <button
                onClick={() => { setError(null); setLoading(true); fetch('/api/sops').then(r => r.json()).then(d => { setSops(d.sops ?? []); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) }) }}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'var(--surface2)', color: 'var(--text2)' }}
              >
                Réessayer
              </button>
            </div>
          )}

          {/* Liste SOPs */}
          {!loading && !error && (
            <div className="flex flex-col gap-2">
              {filtered.length === 0 && (
                <p className="text-center text-sm text-[var(--text4)] py-8">
                  Aucune procédure trouvée
                </p>
              )}
              {filtered.map(sop => (
                <div
                  key={sop.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl transition-colors"
                  style={{ background: 'var(--surface2)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--blue-light)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface2)')}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-semibold text-[var(--text1)] truncate">{sop.title}</span>
                    <span className="text-xs text-[var(--text4)]">
                      {sop.category ? `${sop.category.emoji ?? ''} ${sop.category.name} · ` : ''}
                      {sop.step_count} étape{sop.step_count !== 1 ? 's' : ''}
                      {sop.total_duration_seconds > 0 ? ` · ${formatDuration(sop.total_duration_seconds)}` : ''}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedSop(sop)}
                    className="flex-shrink-0 ml-3 text-xs font-medium"
                    style={{ color: 'var(--blue)' }}
                  >
                    Suivre →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
