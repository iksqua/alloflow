'use client'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'

interface HourlyChartProps {
  data: DashboardSummary['hourlyActivity']
}

export function HourlyChart({ data }: HourlyChartProps) {
  const now = new Date().getHours()
  const max = Math.max(...data.map(d => d.count), 1)

  return (
    <div className="rounded-xl border border-[var(--border)] p-5" style={{ background: 'var(--surface)' }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-sm font-bold text-[var(--text1)]">Activité par heure</div>
          <div className="text-xs text-[var(--text3)] mt-0.5">Transactions aujourd'hui</div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full font-semibold" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--green)' }}>
          ● En direct
        </span>
      </div>
      <div className="flex items-end gap-1.5 h-28 pt-2">
        {data.map(({ hour, count }) => {
          const heightPct = count === 0 ? 3 : Math.max(8, (count / max) * 100)
          const isNow = hour === now
          const isPast = hour < now
          const bg = isNow
            ? 'var(--blue)'
            : isPast
            ? 'rgba(29,78,216,0.45)'
            : 'rgba(29,78,216,0.12)'
          return (
            <div key={hour} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
              <div
                className="w-full rounded-t"
                style={{ height: `${heightPct}%`, background: bg, minHeight: '3px' }}
              />
              <div className="text-[9px] text-[var(--text4)]">{hour}h</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
