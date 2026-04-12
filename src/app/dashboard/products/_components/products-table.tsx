'use client'
import { useState } from 'react'
import { StatusToggle } from '@/components/ui/status-toggle'
import { TvaBadge } from '@/components/ui/tva-badge'
import { EmptyState } from '@/components/ui/empty-state'
import type { Product } from './types'

interface ProductsTableProps {
  products: Product[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onSelectAll: (ids: string[]) => void
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  onToggleStatus: (id: string, active: boolean) => Promise<void>
}

export function ProductsTable({
  products,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onEdit,
  onDelete,
  onToggleStatus,
}: ProductsTableProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const allSelected = products.length > 0 && products.every(p => selectedIds.has(p.id))

  async function handleToggle(id: string, active: boolean) {
    setLoadingId(id)
    try { await onToggleStatus(id, active) } finally { setLoadingId(null) }
  }

  if (products.length === 0) {
    return (
      <EmptyState
        icon="☕"
        title="Aucun produit"
        description="Commencez par ajouter vos cafés, cookies et boissons."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
    <table className="w-full min-w-[480px]">
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <th className="px-3 py-2 w-10">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => allSelected ? onSelectAll([]) : onSelectAll(products.map(p => p.id))}
              className="w-4 h-4 rounded accent-[var(--blue)] cursor-pointer"
            />
          </th>
          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--text3)]">Produit</th>
          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--text3)] hidden sm:table-cell">Catégorie</th>
          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--text3)]">Prix TTC</th>
          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--text3)] hidden md:table-cell">TVA</th>
          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--text3)]">Statut</th>
          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-[var(--text3)]">Actions</th>
        </tr>
      </thead>
      <tbody>
        {products.map((product, i) => {
          const isSelected = selectedIds.has(product.id)
          return (
            <tr
              key={product.id}
              style={{
                borderBottom: i < products.length - 1 ? '1px solid rgba(51,65,85,0.5)' : 'none',
                background: isSelected ? 'var(--selection-bg)' : undefined,
              }}
              className="hover:bg-[var(--surface2)] transition-colors"
            >
              <td className="px-3 py-2.5 w-10">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(product.id)}
                  className="w-4 h-4 rounded accent-[var(--blue)] cursor-pointer"
                />
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {product.emoji && <span className="text-lg">{product.emoji}</span>}
                  <div>
                    <div className="text-sm font-medium text-[var(--text1)]">{product.name}</div>
                    {product.description && (
                      <div className="text-xs text-[var(--text3)] truncate max-w-48">{product.description}</div>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 hidden sm:table-cell">
                {product.category ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                    style={{
                      background: `${product.category.color_hex}20`,
                      color: product.category.color_hex,
                      border: `1px solid ${product.category.color_hex}40`,
                    }}
                  >
                    {product.category.icon && <span>{product.category.icon}</span>}
                    {product.category.name}
                  </span>
                ) : (
                  <span className="text-xs text-[var(--text4)]">—</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-sm text-[var(--text1)] tabular-nums">
                {(product.price * (1 + product.tva_rate / 100)).toFixed(2)} €
              </td>
              <td className="px-3 py-2.5 hidden md:table-cell">
                <TvaBadge rate={product.tva_rate} />
              </td>
              <td className="px-3 py-2.5">
                <StatusToggle
                  active={product.is_active}
                  loading={loadingId === product.id}
                  onChange={(v) => handleToggle(product.id, v)}
                />
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEdit(product)}
                    data-testid={`product-edit-btn-${product.id}`}
                    className="w-7 h-7 rounded flex items-center justify-center text-[var(--text3)] hover:text-[var(--text1)] hover:bg-[var(--surface2)] transition-colors"
                    title="Modifier"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onDelete(product)}
                    className="w-7 h-7 rounded flex items-center justify-center text-[var(--text3)] hover:text-[var(--red)] hover:bg-[var(--red-bg)] transition-colors"
                    title="Supprimer"
                  >
                    🗑️
                  </button>
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
  )
}
