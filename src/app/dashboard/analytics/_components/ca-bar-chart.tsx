import type { DailyCA } from '@/lib/analytics/types'

interface CaBarChartProps {
  data: DailyCA[]
}

function formatDay(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

function isToday(iso: string): boolean {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return iso.startsWith(todayStr)
}

export function CaBarChart({ data }: CaBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-[18px] flex flex-col">
        <span className="text-sm font-semibold text-slate-200 mb-4">Chiffre d&apos;affaires</span>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-500 text-center py-8 text-sm">Aucune vente sur la période</p>
        </div>
      </div>
    )
  }

  const maxValue = Math.max(...data.map((d) => d.caTtc), 1)
  const totalCA = data.reduce((s, d) => s + d.caTtc, 0)
  const totalFormatted = totalCA.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'
  const midIndex = Math.floor(data.length / 2)

  return (
    <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-[18px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-slate-200">
          CA — {data.length} dernier{data.length > 1 ? 's' : ''} jour{data.length > 1 ? 's' : ''}
        </span>
        <span className="text-sm font-bold text-blue-400">{totalFormatted}</span>
      </div>

      {/* Bars */}
      <div className="flex items-end gap-[3px] h-24">
        {data.map((d) => {
          const heightPct = maxValue > 0 ? (d.caTtc / maxValue) * 100 : 0
          const today = isToday(d.day)
          return (
            <div
              key={d.day}
              title={`${formatDay(d.day)} — ${d.caTtc.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €`}
              className={`flex-1 rounded-t-sm transition-colors ${
                today
                  ? 'bg-blue-500'
                  : 'bg-blue-500/50 hover:bg-blue-500'
              }`}
              style={{ height: `${Math.max(heightPct, 2)}%` }}
            />
          )
        })}
      </div>

      {/* Date labels */}
      <div className="flex items-center mt-1" style={{ gap: '3px' }}>
        {data.map((d, i) => {
          const showLabel = i === 0 || i === midIndex || isToday(d.day)
          return (
            <div key={d.day} className="flex-1 text-center">
              {showLabel && (
                <span className="text-[9px] text-slate-500">
                  {isToday(d.day) ? 'auj.' : formatDay(d.day)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
