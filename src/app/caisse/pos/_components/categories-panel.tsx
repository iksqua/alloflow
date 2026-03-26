'use client'

interface CategoriesPanelProps {
  categories: Array<{ id: string; name: string; icon: string | null; color_hex: string }>
  selectedId: string | null
  onSelect: (id: string | null) => void
  allCount: number
}

export function CategoriesPanel({ categories, selectedId, onSelect, allCount }: CategoriesPanelProps) {
  return (
    <div
      className="flex flex-col flex-shrink-0 overflow-y-auto border-r border-[var(--border)]"
      style={{ width: '200px', background: '#0c1a2e' }}
    >
      {/* Tout */}
      <button
        onClick={() => onSelect(null)}
        className={[
          'flex items-center gap-2.5 px-4 py-3.5 text-sm transition-colors border-b border-[var(--border)]',
          selectedId === null
            ? 'bg-[var(--blue-light)] text-[var(--text1)] border-l-2 border-[var(--blue)] pl-[14px]'
            : 'text-[var(--text2)] hover:bg-[var(--surface2)]',
        ].join(' ')}
      >
        <span>🍽️</span>
        <span className="font-medium">Tout</span>
        <span className="ml-auto text-xs text-[var(--text4)]">{allCount}</span>
      </button>

      {/* Catégories */}
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={[
            'flex items-center gap-2.5 px-4 py-3.5 text-sm transition-colors border-b border-[var(--border)]',
            selectedId === cat.id
              ? 'bg-[var(--blue-light)] text-[var(--text1)] border-l-2 border-[var(--blue)] pl-[14px]'
              : 'text-[var(--text2)] hover:bg-[var(--surface2)]',
          ].join(' ')}
        >
          {cat.icon && <span>{cat.icon}</span>}
          <span className="font-medium truncate">{cat.name}</span>
        </button>
      ))}
    </div>
  )
}
