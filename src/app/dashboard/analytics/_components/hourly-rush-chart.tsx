import type { HourlyTx } from '@/lib/analytics/types'

interface HourlyRushChartProps {
  data: HourlyTx[]
}

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)' }

const BUSINESS_HOURS = Array.from({ length: 24 }, (_, i) => i)

export function HourlyRushChart({ data }: HourlyRushChartProps) {
  const byHour = new Map(data.map(d => [d.hour, d.txCount]))
  const maxTx = Math.max(...data.map(d => d.txCount), 1)
  const totalTx = data.reduce((s, d) => s + d.txCount, 0)

  const peakHour = data.length > 0
    ? data.reduce((best, d) => d.txCount > best.txCount ? d : best, data[0])
    : null

  if (totalTx === 0) {
    return (
      <div className="rounded-[14px] p-[18px] flex flex-col" style={cardStyle}>
        <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Heures de rush</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[var(--text4)] text-center py-8 text-sm">Aucune donnée disponible</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-[14px] p-[18px]" style={cardStyle}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text1)]">Heures de rush</h3>
        {peakHour && (
          <span className="text-xs text-[var(--text4)]">
            Pic : <span className="font-semibold text-[var(--text2)]">{peakHour.hour}h–{peakHour.hour + 1}h</span>
            {' '}({peakHour.txCount} tickets)
          </span>
        )}
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-[2px] h-20">
        {BUSINESS_HOURS.map(hour => {
          const tx = byHour.get(hour) ?? 0
          const heightPct = (tx / maxTx) * 100
          const isPeak = peakHour?.hour === hour
          return (
            <div
              key={hour}
              title={`${hour}h–${hour + 1}h : ${tx} ticket${tx > 1 ? 's' : ''}`}
              className="flex-1 rounded-t-sm transition-colors"
              style={{
                height: `${Math.max(heightPct, tx > 0 ? 4 : 1)}%`,
                background: isPeak
                  ? 'var(--blue)'
                  : tx > 0
                  ? 'rgba(59,130,246,0.4)'
                  : 'var(--surface2)',
              }}
            />
          )
        })}
      </div>

      {/* Hour labels — only show midnight, 6h, 12h, 18h, 23h */}
      <div className="flex mt-1" style={{ gap: '2px' }}>
        {BUSINESS_HOURS.map(hour => (
          <div key={hour} className="flex-1 text-center">
            {(hour === 0 || hour === 6 || hour === 12 || hour === 18 || hour === 23) && (
              <span className="text-[9px] text-[var(--text4)]">{hour}h</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
