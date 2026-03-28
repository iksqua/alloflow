// src/app/caisse/pos/_components/loyalty-badge.tsx
import type { LoyaltyCustomer, LoyaltyReward } from '../types'

interface Props {
  customer: LoyaltyCustomer
  reward: LoyaltyReward | null
  orderTotal: number
}

export function LoyaltyBadge({ customer, reward, orderTotal }: Props) {
  const rewardDiscount = reward
    ? (reward.type === 'percent' || reward.type === 'reduction_pct')
      ? Math.round(orderTotal * (reward.value / 100) * 100) / 100
      : reward.value
    : 0
  const pointsToEarn = Math.floor(orderTotal - rewardDiscount)

  const tierColors: Record<string, string> = {
    gold:     'text-yellow-400',
    silver:   'text-slate-300',
    standard: 'text-[var(--text4)]',
  }

  return (
    <div className="px-3 py-2 rounded-lg border border-[var(--border)] flex items-center gap-2.5" style={{ background: 'var(--bg)' }}>
      <div className="w-7 h-7 rounded-full bg-[var(--blue)] flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
        {customer.first_name[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-[var(--text1)] truncate">
          {customer.first_name} {customer.last_name ?? ''}
          <span className={`ml-1.5 text-[10px] font-medium ${tierColors[customer.tier] ?? ''}`}>
            {customer.tier}
          </span>
        </div>
        {reward && (
          <div className="text-[10px] text-[var(--green)]">🎁 {reward.name} appliquée</div>
        )}
      </div>
      <div className="text-xs font-bold text-[var(--blue)] flex-shrink-0">
        +{pointsToEarn} pts
      </div>
    </div>
  )
}
