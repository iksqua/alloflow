import type { KpiSummary } from '@/lib/analytics/types'

interface KpiCardsProps {
  data: KpiSummary
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null
  const isPositive = delta >= 0
  return (
    <span className={`text-xs font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
      {isPositive ? '↑' : '↓'} {isPositive ? '+' : ''}{delta.toFixed(1)}% vs période préc.
    </span>
  )
}

const cardClass = 'bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-4 flex flex-col gap-2'

export function KpiCards({ data }: KpiCardsProps) {
  const caTtcFormatted = data.caTtc.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'
  const avgTicketFormatted = data.avgTicket.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'

  return (
    <div className="grid grid-cols-4 gap-4 mb-5">
      {/* CA TTC */}
      <div className={cardClass}>
        <span className="text-xs text-slate-400 font-medium">CA TTC</span>
        <span className="text-2xl font-bold text-blue-400">{caTtcFormatted}</span>
        <DeltaBadge delta={data.deltaCaTtc} />
      </div>

      {/* Transactions */}
      <div className={cardClass}>
        <span className="text-xs text-slate-400 font-medium">Transactions</span>
        <span className="text-2xl font-bold text-slate-100">{data.txCount}</span>
        <DeltaBadge delta={data.deltaTxCount} />
      </div>

      {/* Ticket moyen */}
      <div className={cardClass}>
        <span className="text-xs text-slate-400 font-medium">Ticket moyen</span>
        <span className="text-2xl font-bold text-slate-100">{avgTicketFormatted}</span>
        <DeltaBadge delta={data.deltaAvgTicket} />
      </div>

      {/* Espèces vs Carte */}
      <div className={cardClass}>
        <span className="text-xs text-slate-400 font-medium">Espèces vs Carte</span>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-amber-400">{data.cashPct}%</span>
          <span className="text-slate-500 text-sm">·</span>
          <span className="text-xl font-bold text-blue-400">{data.cardPct}%</span>
        </div>
        {/* Mini progress bar */}
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mt-1">
          <div
            className="h-full bg-amber-400 rounded-full"
            style={{ width: `${data.cashPct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Espèces</span>
          <span>Carte</span>
        </div>
      </div>
    </div>
  )
}
