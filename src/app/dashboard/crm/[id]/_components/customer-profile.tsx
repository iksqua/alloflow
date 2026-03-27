// src/app/dashboard/crm/[id]/_components/customer-profile.tsx
import Link from 'next/link'

interface Customer {
  id: string
  first_name: string
  last_name: string | null
  tier: 'standard' | 'silver' | 'gold'
  points: number
  phone: string | null
  email: string | null
  created_at: string
}

interface Props {
  customer: Customer
  totalRevenue: number
  visitCount: number
  avgTicket: number
}

const TIER_LABELS: Record<string, string> = {
  gold: 'Gold',
  silver: 'Silver',
  standard: 'Standard',
}

const TIER_COLORS: Record<string, { bg: string; text: string }> = {
  gold: { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24' },
  silver: { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8' },
  standard: { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8' },
}

function getInitials(firstName: string, lastName: string | null) {
  const first = firstName.charAt(0).toUpperCase()
  const last = lastName ? lastName.charAt(0).toUpperCase() : ''
  return first + last
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatCurrency(amount: number) {
  return amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

export function CustomerProfile({ customer, totalRevenue, visitCount, avgTicket }: Props) {
  const tierColors = TIER_COLORS[customer.tier] ?? TIER_COLORS.standard

  return (
    <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] p-5">
      {/* Back link */}
      <Link
        href="/dashboard/crm"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--text3)] hover:text-[var(--text1)] transition-colors mb-5"
      >
        <span>←</span>
        <span>Retour</span>
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
          style={{ background: '#8b5cf6' }}
        >
          {getInitials(customer.first_name, customer.last_name)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-lg font-semibold text-[var(--text1)]">
              {customer.first_name} {customer.last_name ?? ''}
            </h1>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ background: tierColors.bg, color: tierColors.text }}
            >
              {TIER_LABELS[customer.tier]}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {customer.phone && (
              <span className="text-sm text-[var(--text3)]">
                📞 {customer.phone}
              </span>
            )}
            {customer.email && (
              <span className="text-sm text-[var(--text3)]">
                ✉ {customer.email}
              </span>
            )}
            <span className="text-xs text-[var(--text4)]">
              Client depuis le {formatDate(customer.created_at)}
            </span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'CA total', value: formatCurrency(totalRevenue) },
          { label: 'Visites', value: visitCount.toString() },
          { label: 'Ticket moyen', value: visitCount > 0 ? formatCurrency(avgTicket) : '—' },
          { label: 'Points actuels', value: `${customer.points.toLocaleString('fr-FR')} pts` },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-[10px] p-3"
            style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}
          >
            <div className="text-xs font-semibold text-[var(--text4)] uppercase tracking-wide mb-1">{label}</div>
            <div className="text-sm font-semibold text-[var(--text1)]">{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
