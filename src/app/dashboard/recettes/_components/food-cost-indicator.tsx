// src/app/dashboard/recettes/_components/food-cost-indicator.tsx
interface Props {
  amount: number         // food cost in €
  pct: number | null     // percentage (0-100)
  compact?: boolean      // true = single line, false = full with bar
}

export function FoodCostIndicator({ amount, pct, compact = false }: Props) {
  const color = pct === null ? 'text-[var(--text4)]'
    : pct < 30  ? 'text-green-400'
    : pct < 35  ? 'text-amber-400'
    : 'text-red-400'

  const barColor = pct === null ? 'bg-[var(--border)]'
    : pct < 30  ? 'bg-green-500'
    : pct < 35  ? 'bg-amber-500'
    : 'bg-red-500'

  if (compact) {
    return (
      <span className={`text-xs font-semibold ${color}`}>
        {pct !== null ? `Food cost ${pct}%` : `${amount.toFixed(2)} €`}
      </span>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--text4)]">Food cost</span>
        <span className={`font-bold ${color}`}>
          {pct !== null ? `${pct}%` : '—'} · {amount.toFixed(2)} €
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        {pct !== null && (
          <div
            className={`absolute left-0 top-0 h-full rounded-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        )}
        {/* 35% threshold marker */}
        <div
          className="absolute top-0 h-full w-px bg-[var(--text4)]/40"
          style={{ left: '35%' }}
        />
      </div>
    </div>
  )
}
