'use client'
import type { DashboardData } from '@/app/dashboard/_lib/fetch-dashboard-data'

function delta(cur: number, prev: number) {
  if (prev === 0) return null
  const pct = ((cur - prev) / prev) * 100
  return { value: pct, positive: pct >= 0 }
}

function DeltaBadge({ cur, prev, suffix = '%', label = 'vs période préc.' }: { cur: number; prev: number; suffix?: string; label?: string }) {
  const d = delta(cur, prev)
  if (!d) return <span className="text-[var(--text3)] text-[11px]">—</span>
  return (
    <span className={`text-[11px] font-medium ${d.positive ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
      {d.positive ? '↑' : '↓'} {Math.abs(d.value).toFixed(1)}{suffix}
      <span className="text-[var(--text4)] font-normal ml-1">{label}</span>
    </span>
  )
}

interface Props {
  kpis: DashboardData['kpis']
  isToday: boolean
}

export function KpiCards({ kpis, isToday }: Props) {
  const prevLabel = isToday ? 'vs hier' : 'vs période préc.'

  const cards = [
    {
      label: isToday ? 'CA du jour' : 'CA total',
      value: `${kpis.ca.toFixed(2).replace('.', ',')} €`,
      color: 'var(--blue)',
      sub: <DeltaBadge cur={kpis.ca} prev={kpis.caPrev} label={prevLabel} />,
    },
    {
      label: 'Commandes',
      value: String(kpis.orders),
      color: 'var(--green)',
      sub: <DeltaBadge cur={kpis.orders} prev={kpis.ordersPrev} suffix=" cmd" label={prevLabel} />,
    },
    {
      label: 'Ticket moyen',
      value: `${kpis.avgTicket.toFixed(2).replace('.', ',')} €`,
      color: '#f59e0b',
      sub: <DeltaBadge cur={kpis.avgTicket} prev={kpis.avgTicketPrev} label={prevLabel} />,
    },
    {
      label: isToday ? 'Clients fidèles' : 'Clients fidèles actifs',
      value: String(kpis.loyalCustomers),
      color: '#a855f7',
      sub: <span className="text-[11px] text-[var(--text3)]">avec transaction fidélité</span>,
    },
    {
      label: 'Nouveaux clients',
      value: String(kpis.newCustomers),
      color: '#06b6d4',
      sub: <span className="text-[11px] text-[var(--text3)]">inscrits sur la période</span>,
    },
    {
      label: 'Articles / commande',
      value: String(kpis.avgItemsPerOrder),
      color: '#10b981',
      sub: <span className="text-[11px] text-[var(--text3)]">panier moyen en articles</span>,
    },
    {
      label: 'Remboursements',
      value: String(kpis.refundCount),
      color: kpis.refundCount > 0 ? 'var(--red)' : 'var(--text3)',
      sub: <span className="text-[11px] text-[var(--text3)]">annulations + remboursements</span>,
    },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-5">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl p-4 border border-[var(--border)] flex flex-col gap-2"
          style={{ background: 'var(--surface)', borderTop: `2px solid ${c.color}` }}
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--text4)]">{c.label}</div>
          <div className="text-2xl font-extrabold tracking-tight text-[var(--text1)]">{c.value}</div>
          {c.sub}
        </div>
      ))}
    </div>
  )
}
