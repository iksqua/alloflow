// src/app/dashboard/crm/_components/crm-stat-cards.tsx
import type { CrmStats } from './types'

interface Props {
  stats: CrmStats
}

interface StatCardProps {
  label: string
  value: string | number
  icon: string
  iconBg: string
  iconColor: string
}

function StatCard({ label, value, icon, iconBg, iconColor }: StatCardProps) {
  return (
    <div
      className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text3)] font-medium uppercase tracking-wide">
          {label}
        </span>
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </span>
      </div>
      <div className="text-2xl font-bold text-[var(--text1)]">{value}</div>
    </div>
  )
}

export function CrmStatCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
      <StatCard
        label="Clients inscrits"
        value={stats.totalCustomers}
        icon="👥"
        iconBg="rgba(139,92,246,0.15)"
        iconColor="#a78bfa"
      />
      <StatCard
        label="Membres Gold"
        value={stats.goldCount}
        icon="⭐"
        iconBg="rgba(251,191,36,0.15)"
        iconColor="#fbbf24"
      />
      <StatCard
        label="Points ce mois"
        value={stats.ptsDistributedThisMonth.toLocaleString('fr-FR')}
        icon="🎯"
        iconBg="rgba(16,185,129,0.15)"
        iconColor="#34d399"
      />
      <StatCard
        label="Récompenses utilisées"
        value={stats.rewardsUsedThisMonth}
        icon="🎁"
        iconBg="rgba(59,130,246,0.15)"
        iconColor="#60a5fa"
      />
    </div>
  )
}
