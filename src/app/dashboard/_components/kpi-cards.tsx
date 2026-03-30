'use client'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'

function delta(today: number, yesterday: number) {
  if (yesterday === 0) return null
  const pct = ((today - yesterday) / yesterday) * 100
  return { value: pct, positive: pct >= 0 }
}

function DeltaBadge({ today, yesterday, suffix = '%' }: { today: number; yesterday: number; suffix?: string }) {
  const d = delta(today, yesterday)
  if (!d) return <span className="text-[var(--text3)] text-xs">—</span>
  return (
    <span className={d.positive ? 'text-[var(--green)] text-xs' : 'text-[var(--red)] text-xs'}>
      {d.positive ? '↑' : '↓'} {Math.abs(d.value).toFixed(1)}{suffix} vs hier
    </span>
  )
}

interface KpiCardsProps {
  kpis: DashboardSummary['kpis']
}

export function KpiCards({ kpis }: KpiCardsProps) {
  const cards = [
    {
      label: 'CA du jour',
      value: `${kpis.caToday.toFixed(2).replace('.', ',')} €`,
      color: 'var(--blue)',
      delta: <DeltaBadge today={kpis.caToday} yesterday={kpis.caYesterday} />,
    },
    {
      label: 'Commandes',
      value: String(kpis.ordersToday),
      color: 'var(--green)',
      delta: <DeltaBadge today={kpis.ordersToday} yesterday={kpis.ordersYesterday} suffix=" cmd" />,
    },
    {
      label: 'Ticket moyen',
      value: `${kpis.avgTicketToday.toFixed(2).replace('.', ',')} €`,
      color: 'var(--amber)',
      delta: <DeltaBadge today={kpis.avgTicketToday} yesterday={kpis.avgTicketYesterday} />,
    },
    {
      label: 'Clients fidèles',
      value: String(kpis.loyalCustomersToday),
      color: '#a855f7',
      delta: <span className="text-[var(--text3)] text-xs">pointés aujourd'hui</span>,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl p-5 border border-[var(--border)]"
          style={{ background: 'var(--surface)', borderTop: `2px solid ${c.color}` }}
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text4)] mb-2.5">{c.label}</div>
          <div className="text-3xl font-extrabold tracking-tight text-[var(--text1)] mb-2">{c.value}</div>
          {c.delta}
        </div>
      ))}
    </div>
  )
}
