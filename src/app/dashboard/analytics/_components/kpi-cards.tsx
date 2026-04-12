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

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)' }

export function KpiCards({ data }: KpiCardsProps) {
  const caTtcFormatted = data.caTtc.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'
  const avgTicketFormatted = data.avgTicket.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <div className="rounded-[14px] p-4 flex flex-col gap-2" style={cardStyle}>
        <span className="text-xs text-[var(--text3)] font-medium">CA TTC</span>
        <span className="text-2xl font-bold text-blue-400">{caTtcFormatted}</span>
        <DeltaBadge delta={data.deltaCaTtc} />
      </div>

      <div className="rounded-[14px] p-4 flex flex-col gap-2" style={cardStyle}>
        <span className="text-xs text-[var(--text3)] font-medium">Transactions</span>
        <span className="text-2xl font-bold text-[var(--text1)]">{data.txCount}</span>
        <DeltaBadge delta={data.deltaTxCount} />
      </div>

      <div className="rounded-[14px] p-4 flex flex-col gap-2" style={cardStyle}>
        <span className="text-xs text-[var(--text3)] font-medium">Ticket moyen</span>
        <span className="text-2xl font-bold text-[var(--text1)]">{avgTicketFormatted}</span>
        <DeltaBadge delta={data.deltaAvgTicket} />
      </div>

      <div className="rounded-[14px] p-4 flex flex-col gap-2" style={cardStyle}>
        <span className="text-xs text-[var(--text3)] font-medium">Espèces vs Carte</span>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-amber-400">{data.cashPct}%</span>
          <span className="text-[var(--text4)] text-sm">·</span>
          <span className="text-xl font-bold text-blue-400">{data.cardPct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ background: 'var(--surface2)' }}>
          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${data.cashPct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-[var(--text4)]">
          <span>Espèces</span>
          <span>Carte</span>
        </div>
      </div>
    </div>
  )
}
