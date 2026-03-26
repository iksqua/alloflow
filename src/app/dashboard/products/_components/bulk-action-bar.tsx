'use client'
import type { BulkAction, Category } from './types'

interface BulkActionBarProps {
  count: number
  categories: Category[]
  onAction: (action: BulkAction, extra?: { category_id?: string }) => void
  onClear: () => void
}

export function BulkActionBar({ count, categories, onAction, onClear }: BulkActionBarProps) {
  if (count === 0) return null

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] shadow-2xl"
      style={{ background: 'var(--surface)', minWidth: 480 }}
    >
      <span className="text-sm font-semibold text-[var(--text1)] mr-2">
        {count} sélectionné{count > 1 ? 's' : ''}
      </span>

      <button
        onClick={() => onAction('activate')}
        className="h-8 px-3 rounded-lg text-xs font-medium transition-colors hover:opacity-90 text-white"
        style={{ background: 'var(--green)' }}
      >
        ✅ Activer
      </button>

      <button
        onClick={() => onAction('deactivate')}
        className="h-8 px-3 rounded-lg text-xs font-medium border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] transition-colors"
        style={{ background: 'var(--surface)' }}
      >
        ⏸️ Désactiver
      </button>

      {categories.length > 0 && (
        <select
          onChange={(e) => {
            if (e.target.value) onAction('change_category', { category_id: e.target.value })
            e.target.value = ''
          }}
          className="h-8 px-2 rounded-lg text-xs border border-[var(--border)] text-[var(--text2)] focus:outline-none"
          style={{ background: 'var(--surface)' }}
          defaultValue=""
        >
          <option value="" disabled>Changer catégorie…</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>
      )}

      <button
        onClick={() => onAction('delete')}
        className="h-8 px-3 rounded-lg text-xs font-medium transition-colors text-white hover:opacity-90"
        style={{ background: 'var(--red)' }}
      >
        🗑️ Supprimer
      </button>

      <div className="h-5 w-px bg-[var(--border)] mx-1" />

      <button
        onClick={onClear}
        className="text-xs text-[var(--text3)] hover:text-[var(--text1)] transition-colors"
      >
        ✕ Annuler
      </button>
    </div>
  )
}
