'use client'
import type { Product } from './types'

interface ProductsStatsProps {
  products: Product[]
}

export function ProductsStats({ products }: ProductsStatsProps) {
  const total = products.length
  const actifs = products.filter(p => p.is_active).length
  const inactifs = total - actifs
  const prixMoyen = total > 0
    ? (products.reduce((sum, p) => sum + p.price, 0) / total).toFixed(2)
    : '0.00'

  const stats = [
    { label: 'Total produits', value: total, color: 'var(--blue)' },
    { label: 'Actifs', value: actifs, color: 'var(--green)' },
    { label: 'Inactifs', value: inactifs, color: 'var(--text3)' },
    { label: 'Prix moyen', value: `${prixMoyen} €`, color: 'var(--amber)' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex-1 rounded-lg px-4 py-3 border border-[var(--border)]"
          style={{ background: 'var(--surface)' }}
        >
          <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
          <div className="text-xs text-[var(--text3)] mt-0.5">{s.label}</div>
        </div>
      ))}
    </div>
  )
}
