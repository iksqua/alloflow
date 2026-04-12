'use client'
import type { DashboardData } from '@/app/dashboard/_lib/fetch-dashboard-data'

interface TopProductsProps {
  products: DashboardData['topProducts']
  label?: string
}

export function TopProducts({ products, label = "Aujourd'hui" }: TopProductsProps) {
  const maxRevenue = products[0]?.revenue ?? 1

  return (
    <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
      <div className="mb-4">
        <div className="text-sm font-bold text-[var(--text1)]">Top produits</div>
        <div className="text-xs text-[var(--text3)] mt-0.5">{label} · Par chiffre d'affaires</div>
      </div>

      {products.length === 0 && (
        <div className="text-sm text-[var(--text3)] py-4 text-center">Aucune vente pour le moment</div>
      )}

      <div className="flex flex-col divide-y divide-[var(--border)]/30">
        {products.map((p) => (
          <div key={p.rank} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="w-5 text-[11px] font-bold text-[var(--text4)] text-center">#{p.rank}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--text1)] truncate">{p.name}</div>
              </div>
            <div className="text-right">
              <div className="text-sm font-bold text-[var(--text1)]">{p.revenue.toFixed(2).replace('.', ',')} €</div>
              <div className="text-[11px] text-[var(--text3)]">{p.quantity} vendus</div>
              <div className="w-14 h-0.5 rounded mt-1 ml-auto" style={{ background: 'var(--surface2)' }}>
                <div
                  className="h-0.5 rounded"
                  style={{ width: `${(p.revenue / maxRevenue) * 100}%`, background: 'var(--blue)' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
