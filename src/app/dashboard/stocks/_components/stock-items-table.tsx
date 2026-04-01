// src/app/dashboard/stocks/_components/stock-items-table.tsx
'use client'
import { useState } from 'react'
import type { StockItem, StockStatus } from './types'

const STATUS_LABELS: Record<StockStatus, string> = {
  ok: '✓ OK',
  alert: '⚠ Bas',
  out_of_stock: '✕ Rupture',
}
const STATUS_CLASSES: Record<StockStatus, string> = {
  ok: 'bg-green-900/20 text-green-400',
  alert: 'bg-amber-900/20 text-amber-400',
  out_of_stock: 'bg-red-900/20 text-red-400',
}

interface Props {
  items: StockItem[]
  onEdit: (item: StockItem) => void
  onDelete: (id: string) => Promise<void>
}

export function StockItemsTable({ items, onEdit, onDelete }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | StockStatus>('all')

  const filtered = items
    .filter(i => !search || i.name.toLowerCase().includes(search.toLowerCase()))
    .filter(i => statusFilter === 'all' || i.status === statusFilter)

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="px-3 py-1.5 rounded-lg text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text2)] w-52"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="px-3 py-1.5 rounded-lg text-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--text3)]"
        >
          <option value="all">Tous les statuts</option>
          <option value="out_of_stock">Rupture</option>
          <option value="alert">Alerte</option>
          <option value="ok">OK</option>
        </select>
        <span className="ml-auto text-xs text-[var(--text4)]">{filtered.length} article{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--text4)]">Aucun article trouvé</div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] overflow-x-auto" style={{ background: 'var(--surface)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                {['Article', 'Catégorie', 'Stock', 'Seuil', 'Niveau', 'Prix unitaire', 'Fournisseur', 'Statut', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const pct = item.alert_threshold > 0
                  ? Math.min(100, (item.quantity / (item.alert_threshold * 2)) * 100)
                  : item.quantity > 0 ? 80 : 0
                return (
                  <tr key={item.id} className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--surface2)]/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text1)]">{item.name}</span>
                        {item.is_pos && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-400 shrink-0">CAISSE</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text3)]">{item.category ?? '—'}</td>
                    <td className="px-4 py-2.5 font-bold text-[var(--text1)]">
                      {item.quantity} <span className="text-xs text-[var(--text4)] font-normal">{item.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text4)] text-xs">{item.alert_threshold} {item.unit}</td>
                    <td className="px-4 py-2.5">
                      <div className="w-20 h-1.5 rounded-full bg-[var(--border)]">
                        <div
                          className={`h-1.5 rounded-full ${item.status === 'ok' ? 'bg-green-500' : item.status === 'alert' ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text2)] tabular-nums">
                      {item.unit_price.toFixed(2)} €<span className="text-xs text-[var(--text4)]">/{item.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text3)]">{item.supplier ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_CLASSES[item.status]}`}>
                        {STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button onClick={() => onEdit(item)} className="w-7 h-7 rounded flex items-center justify-center text-[var(--text3)] hover:text-[var(--text1)] hover:bg-[var(--surface2)] transition-colors" title="Modifier">✏️</button>
                        <button onClick={() => onDelete(item.id)} className="w-7 h-7 rounded flex items-center justify-center text-[var(--text3)] hover:text-[var(--red)] hover:bg-[var(--red-bg)] transition-colors" title="Supprimer">🗑️</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
