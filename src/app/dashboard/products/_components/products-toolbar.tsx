'use client'
import { useState, useTransition } from 'react'
import type { Category } from './types'

interface ProductsToolbarProps {
  categories: Category[]
  onSearch: (value: string) => void
  onFilterCategory: (id: string | null) => void
  onFilterStatus: (status: 'all' | 'active' | 'inactive') => void
  onOpenCategories: () => void
}

export function ProductsToolbar({
  categories,
  onSearch,
  onFilterCategory,
  onFilterStatus,
  onOpenCategories,
}: ProductsToolbarProps) {
  const [search, setSearch] = useState('')
  const [activeStatus, setActiveStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [, startTransition] = useTransition()

  function handleSearch(value: string) {
    setSearch(value)
    startTransition(() => onSearch(value))
  }

  function handleStatus(s: 'all' | 'active' | 'inactive') {
    setActiveStatus(s)
    onFilterStatus(s)
  }

  return (
    <div className="flex flex-col gap-2 mb-4">
      {/* Ligne 1 : Recherche + Catégories */}
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text4)] text-sm select-none">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full h-9 pl-8 pr-3 rounded-lg text-sm border border-[var(--border)] text-[var(--text1)] placeholder:text-[var(--text4)] focus:outline-none focus:border-[var(--blue)] transition-colors"
            style={{ background: 'var(--surface)' }}
          />
        </div>
        <button
          onClick={onOpenCategories}
          className="h-9 px-3 rounded-lg text-sm border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors flex-shrink-0"
          style={{ background: 'var(--surface)' }}
        >
          🏷️ <span className="hidden sm:inline">Catégories</span>
        </button>
      </div>

      {/* Ligne 2 : Filtre catégorie + Filtre statut */}
      <div className="flex gap-2 flex-wrap">
        <select
          onChange={(e) => onFilterCategory(e.target.value || null)}
          className="h-9 px-3 rounded-lg text-sm border border-[var(--border)] text-[var(--text2)] focus:outline-none focus:border-[var(--blue)] transition-colors flex-1 min-w-0"
          style={{ background: 'var(--surface)' }}
        >
          <option value="">Toutes catégories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.icon ? `${cat.icon} ` : ''}{cat.name}</option>
          ))}
        </select>

        <div className="flex rounded-lg overflow-hidden border border-[var(--border)] flex-shrink-0">
          {(['all', 'active', 'inactive'] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleStatus(s)}
              className="h-9 px-3 sm:px-4 text-sm transition-colors whitespace-nowrap"
              style={{
                background: activeStatus === s ? 'var(--blue)' : 'var(--surface)',
                color: activeStatus === s ? '#fff' : 'var(--text3)',
              }}
            >
              {s === 'all' ? 'Tous' : s === 'active' ? 'Actifs' : 'Inactifs'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
