import type { SiteSnapshot } from '@/lib/analytics/types'

interface NetworkSnapshotProps {
  data: SiteSnapshot[]
  period: string
}

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)' }

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

export function NetworkSnapshot({ data, period }: NetworkSnapshotProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-[14px] p-[18px] flex flex-col" style={cardStyle}>
        <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Snapshot réseau</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[var(--text4)] text-center py-8 text-sm">Aucun établissement dans le réseau</p>
        </div>
      </div>
    )
  }

  const totalCa = data.reduce((s, d) => s + d.caTtc, 0)
  const maxCa = Math.max(...data.map(d => d.caTtc), 1)
  const avgCa = totalCa / data.length
  const sorted = [...data].sort((a, b) => b.caTtc - a.caTtc)

  const periodLabel = period === 'today' ? 'aujourd\'hui'
    : period === '7d' ? '7 derniers jours'
    : period === '30d' ? '30 derniers jours'
    : 'la période'

  return (
    <div className="rounded-[14px] p-[18px]" style={cardStyle}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-[var(--text1)]">Snapshot réseau</h3>
        <span className="text-xs text-[var(--text4)]">{data.length} sites</span>
      </div>
      <p className="text-xs text-[var(--text4)] mb-4">
        Total réseau : <span className="font-semibold text-[var(--text2)]">{fmt(totalCa)}</span>
        {' '}— moy. : <span className="font-semibold text-[var(--text2)]">{fmt(avgCa)}</span>
        {' '}({periodLabel})
      </p>

      <div className="flex flex-col gap-2.5">
        {sorted.map((site, i) => {
          const barPct = (site.caTtc / maxCa) * 100
          const vsAvg = avgCa > 0 ? Math.round(((site.caTtc - avgCa) / avgCa) * 100) : null
          return (
            <div key={site.establishmentId}>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] text-[var(--text4)] w-4 flex-shrink-0">#{i + 1}</span>
                  <span className="text-xs text-[var(--text2)] truncate font-medium">{site.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {vsAvg !== null && (
                    <span
                      className="text-[10px] font-semibold"
                      style={{ color: vsAvg >= 0 ? 'var(--green)' : 'var(--red)' }}
                    >
                      {vsAvg >= 0 ? '+' : ''}{vsAvg}%
                    </span>
                  )}
                  <span className="text-xs font-semibold text-[var(--text1)]">{fmt(site.caTtc)}</span>
                </div>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface2)' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(barPct, 2)}%`,
                    background: i === 0 ? 'var(--blue)' : 'rgba(59,130,246,0.45)',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
