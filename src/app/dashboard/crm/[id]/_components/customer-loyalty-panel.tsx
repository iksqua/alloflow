'use client'
// src/app/dashboard/crm/[id]/_components/customer-loyalty-panel.tsx

interface Customer {
  id: string
  tier: 'standard' | 'silver' | 'gold'
  points: number
}

interface LoyaltyTransaction {
  id: string
  type: 'earn' | 'spend' | 'redeem'
  points: number
  created_at: string
  order_id: string | null
}

interface LoyaltyReward {
  id: string
  name: string
  points_required: number
  type: string
  value: number
  active: boolean
}

interface Props {
  customer: Customer
  transactions: LoyaltyTransaction[]
  rewards: LoyaltyReward[]
  network?: {
    id: string
    total_points: number
    tier: 'standard' | 'silver' | 'gold'
  } | null
}

// Standard → Silver: 500 pts, Silver → Gold: 2000 pts
const TIER_THRESHOLDS = {
  standard: { label: 'Silver', target: 500 },
  silver: { label: 'Gold', target: 2000 },
  gold: { label: 'Gold (max)', target: 2000 },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDiscountType(type: string, value: number) {
  if (type === 'percent' || type === 'reduction_pct') return `−${value}%`
  if (type === 'fixed' || type === 'reduction_euros') return `−${value} €`
  return type
}

export function CustomerLoyaltyPanel({ customer, transactions, rewards, network }: Props) {
  const threshold = TIER_THRESHOLDS[customer.tier]
  const progressPct = customer.tier === 'gold'
    ? 100
    : Math.min(100, Math.round((customer.points / threshold.target) * 100))

  return (
    <div className="flex flex-col gap-5">
      {/* Points card */}
      <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-5">
        <h2 className="text-[13px] font-semibold text-slate-100 mb-4">Programme de fidélité</h2>

        <div className="mb-4">
          <div className="flex items-end justify-between mb-2">
            <span className="text-2xl font-bold text-white">
              {customer.points.toLocaleString('fr-FR')}
              <span className="text-sm font-normal text-[var(--text3)] ml-1">pts</span>
            </span>
            {customer.tier !== 'gold' && (
              <span className="text-xs text-[var(--text3)]">
                {threshold.target.toLocaleString('fr-FR')} pts pour {threshold.label}
              </span>
            )}
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progressPct}%`, background: '#8b5cf6' }}
            />
          </div>
          <div className="mt-1.5 text-xs text-[var(--text4)]">{progressPct}% vers {threshold.label}</div>
        </div>

        {/* Send QR */}
        <div className="pt-4 border-t border-white/[0.06]">
          <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-2">Envoyer le QR code</p>
          <div className="flex gap-2">
            <button
              disabled
              title="Bientôt disponible"
              className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-[var(--text2)] opacity-50 cursor-not-allowed"
            >
              📱 SMS
            </button>
            <button
              disabled
              title="Bientôt disponible"
              className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-[var(--text2)] opacity-50 cursor-not-allowed"
            >
              ✉ Email
            </button>
          </div>
        </div>

        {/* Network identity */}
        {network && (
          <div className="pt-4 border-t border-white/[0.06]">
            <p className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-2">Réseau</p>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: 'rgba(96,165,250,0.12)', color: '#60a5fa' }}
              >
                🌐 Membre réseau
              </span>
            </div>
            <p className="text-sm text-[var(--text2)] mt-2">
              Points réseau :{' '}
              <span className="font-semibold text-white">
                {network.total_points.toLocaleString('fr-FR')} pts
              </span>
              {' · '}
              Tier réseau :{' '}
              <span className="font-semibold" style={{ color: network.tier === 'gold' ? '#fbbf24' : network.tier === 'silver' ? '#94a3b8' : 'var(--text2)' }}>
                {network.tier.charAt(0).toUpperCase() + network.tier.slice(1)}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Available rewards */}
      {rewards.length > 0 && (
        <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-5">
          <h2 className="text-[13px] font-semibold text-slate-100 mb-4">Récompenses disponibles</h2>
          <div className="flex flex-col gap-2">
            {rewards.map((reward) => {
              const canUse = customer.points >= reward.points_required
              return (
                <div
                  key={reward.id}
                  className="flex items-center justify-between p-3 rounded-[10px]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="text-sm text-[var(--text1)] truncate">{reward.name}</div>
                    <div className="text-xs text-[var(--text3)] mt-0.5">
                      {reward.points_required.toLocaleString('fr-FR')} pts · {formatDiscountType(reward.type, reward.value)}
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
                    style={
                      canUse
                        ? { background: 'rgba(74,222,128,0.12)', color: '#4ade80' }
                        : { background: 'rgba(100,116,139,0.15)', color: '#64748b' }
                    }
                  >
                    {canUse ? 'Disponible' : 'Verrouillé'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Loyalty timeline */}
      <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-5">
        <h2 className="text-[13px] font-semibold text-slate-100 mb-4">Historique des points</h2>

        {transactions.length === 0 ? (
          <p className="text-sm text-[var(--text3)] text-center py-4">Aucune transaction</p>
        ) : (
          <div className="flex flex-col gap-3">
            {transactions.map((tx) => {
              const isEarn = tx.type === 'earn'
              return (
                <div key={tx.id} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                    style={
                      isEarn
                        ? { background: 'rgba(74,222,128,0.12)', color: '#4ade80' }
                        : { background: 'rgba(248,113,113,0.12)', color: '#f87171' }
                    }
                  >
                    {isEarn ? '↑' : '↓'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-[var(--text2)]">
                      {tx.type === 'earn' ? 'Points gagnés' : tx.type === 'spend' ? 'Points dépensés' : 'Récompense utilisée'}
                    </div>
                    <div className="text-xs text-[var(--text4)]">{formatDate(tx.created_at)}</div>
                  </div>
                  <span
                    className="text-sm font-semibold flex-shrink-0"
                    style={{ color: isEarn ? '#4ade80' : '#f87171' }}
                  >
                    {isEarn ? '+' : '−'}{Math.abs(tx.points)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
