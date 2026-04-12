'use client'
import type { DashboardData } from '@/app/dashboard/_lib/fetch-dashboard-data'

const METHOD_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  card:   { label: 'Carte',    color: '#60a5fa', bg: 'rgba(96,165,250,0.15)' },
  cash:   { label: 'Espèces', color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
  other:  { label: 'Autre',    color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
}

function getConfig(method: string) {
  return METHOD_CONFIG[method] ?? { label: method, color: 'var(--text2)', bg: 'var(--surface2)' }
}

interface Props {
  breakdown: DashboardData['paymentBreakdown']
}

export function PaymentBreakdown({ breakdown }: Props) {
  const total = breakdown.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
      <div className="mb-4">
        <div className="text-sm font-bold text-[var(--text1)]">Modes de paiement</div>
        <div className="text-xs text-[var(--text3)] mt-0.5">Répartition sur la période</div>
      </div>

      {breakdown.length === 0 ? (
        <div className="text-sm text-[var(--text3)] text-center py-4">Aucun paiement</div>
      ) : (
        <>
          {/* Stacked bar */}
          <div className="h-3 rounded-full overflow-hidden flex mb-4" style={{ background: 'var(--surface2)' }}>
            {breakdown.map(p => {
              const pct = total > 0 ? (p.amount / total) * 100 : 0
              const cfg = getConfig(p.method)
              return (
                <div key={p.method} style={{ width: `${pct}%`, background: cfg.color }} title={`${p.method}: ${pct.toFixed(1)}%`} />
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-2">
            {breakdown.map(p => {
              const pct = total > 0 ? Math.round((p.amount / total) * 100) : 0
              const cfg = getConfig(p.method)
              return (
                <div key={p.method} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                  <span className="text-xs text-[var(--text2)] flex-1">{cfg.label}</span>
                  <span className="text-[11px] text-[var(--text3)]">{p.count} tx</span>
                  <span className="text-xs font-semibold text-[var(--text1)] w-20 text-right">
                    {p.amount.toFixed(2).replace('.', ',')} €
                  </span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full w-12 text-center"
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    {pct}%
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
