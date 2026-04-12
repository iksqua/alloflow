import type { TvaBreakdown } from '@/lib/analytics/types'

interface TvaSummaryProps {
  data: TvaBreakdown[]
}

const rateStyles: Record<number, { label: string; color: string }> = {
  5.5: { label: '5,5 %', color: 'text-emerald-400' },
  10:  { label: '10 %',  color: 'text-amber-400' },
  20:  { label: '20 %',  color: 'text-violet-400' },
}

const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)' }

export function TvaSummary({ data }: TvaSummaryProps) {
  const totalTva = data.reduce((s, r) => s + r.tvaAmount, 0)
  const totalHt  = data.reduce((s, r) => s + r.baseHt, 0)

  return (
    <div className="rounded-[14px] p-[18px]" style={cardStyle}>
      <h3 className="text-sm font-semibold text-[var(--text1)] mb-4">Récap TVA</h3>

      {data.length === 0 ? (
        <p className="text-xs text-[var(--text4)] text-center py-4">Aucune donnée TVA</p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.map((row) => {
            const style = rateStyles[row.rate] ?? { label: `${row.rate} %`, color: 'text-[var(--text3)]' }
            return (
              <div key={row.rate} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${style.color}`}>
                    TVA {style.label}
                  </span>
                  <span className={`text-xs font-bold tabular-nums ${style.color}`}>
                    {row.tvaAmount.toFixed(2)} €
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--text4)]">Base HT</span>
                  <span className="text-[10px] text-[var(--text3)] tabular-nums">
                    {row.baseHt.toFixed(2)} €
                  </span>
                </div>
                <div className="h-px" style={{ background: 'var(--border)' }} />
              </div>
            )
          })}

          {/* Total row */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-[var(--text4)] uppercase tracking-wider">Total HT</span>
              <span className="text-xs text-[var(--text2)] tabular-nums font-semibold">
                {totalHt.toFixed(2)} €
              </span>
            </div>
            <div className="flex flex-col gap-0.5 text-right">
              <span className="text-[10px] text-[var(--text4)] uppercase tracking-wider">Total TVA</span>
              <span className="text-sm text-blue-400 tabular-nums font-bold">
                {totalTva.toFixed(2)} €
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
