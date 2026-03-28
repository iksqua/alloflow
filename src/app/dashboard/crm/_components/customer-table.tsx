'use client'
// src/app/dashboard/crm/_components/customer-table.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Customer } from './types'

interface Props {
  customers: Customer[]
}

const TIER_LABELS: Record<string, string> = {
  gold: 'Gold',
  silver: 'Silver',
  standard: 'Standard',
}

// TODO: fetch from loyalty_config when available; using default gold threshold for now
const GOLD_THRESHOLD_PTS = 2000

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

function TierBadge({ tier }: { tier: 'standard' | 'silver' | 'gold' }) {
  const colors = TIER_COLORS[tier] ?? TIER_COLORS.standard
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: colors.bg, color: colors.text }}
    >
      {TIER_LABELS[tier]}
    </span>
  )
}

const RFM_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  vip:      { label: '👑 VIP',      color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  fidele:   { label: '⭐ Fidèle',   color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  nouveau:  { label: '🆕 Nouveau',  color: '#60a5fa', bg: 'rgba(59,130,246,0.12)' },
  a_risque: { label: '⚠ À risque', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  perdu:    { label: '💤 Perdu',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
}

function RfmBadge({ segment }: { segment: string | null }) {
  if (!segment) return null
  const cfg = RFM_CONFIG[segment]
  if (!cfg) return null
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

function PointsCell({ points }: { points: number }) {
  // Gold threshold = GOLD_THRESHOLD_PTS = 100%
  const pct = Math.min(100, Math.round((points / GOLD_THRESHOLD_PTS) * 100))
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <span className="text-sm text-[var(--text1)]">{points.toLocaleString('fr-FR')} pts</span>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: '#8b5cf6' }}
        />
      </div>
    </div>
  )
}

export function CustomerTable({ customers }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<'' | 'gold' | 'silver' | 'standard'>('')

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase()
    const matchSearch =
      !q ||
      c.first_name.toLowerCase().includes(q) ||
      (c.last_name ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)

    const matchTier = !tierFilter || c.tier === tierFilter

    return matchSearch && matchTier
  })

  return (
    <div
      className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] overflow-hidden"
    >
      {/* Filters bar */}
      <div className="flex items-center gap-3 p-4 border-b border-white/[0.06]">
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text3)] text-sm">🔍</span>
          <input
            type="text"
            placeholder="Rechercher un client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white/[0.05] border border-white/[0.08] text-[var(--text1)] placeholder:text-[var(--text3)] focus:outline-none focus:border-[#8b5cf6] transition-colors"
          />
        </div>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as '' | 'gold' | 'silver' | 'standard')}
          className="px-3 py-2 rounded-lg text-sm bg-white/[0.05] border border-white/[0.08] text-[var(--text1)] focus:outline-none focus:border-[#8b5cf6] transition-colors cursor-pointer"
        >
          <option value="">Tous les niveaux</option>
          <option value="gold">Gold</option>
          <option value="silver">Silver</option>
          <option value="standard">Standard</option>
        </select>
        <span className="text-xs text-[var(--text3)] ml-auto">
          {filtered.length} client{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[var(--text3)]">
          <span className="text-4xl mb-3">👥</span>
          <p className="text-sm">
            {customers.length === 0
              ? 'Aucun client enregistré'
              : 'Aucun client ne correspond aux filtres'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Client', 'Statut', 'Segment', 'Points', 'CA total', 'Dernière visite', ''].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium text-[var(--text3)] uppercase tracking-wide"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer, i) => (
                <tr
                  key={customer.id}
                  className={[
                    'border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]',
                    i === filtered.length - 1 ? 'border-b-0' : '',
                  ].join(' ')}
                >
                  {/* Client */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ background: '#8b5cf6' }}
                      >
                        {getInitials(customer.first_name, customer.last_name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[var(--text1)] truncate">
                          {customer.first_name} {customer.last_name ?? ''}
                        </div>
                        {customer.email && (
                          <div className="text-xs text-[var(--text3)] truncate">{customer.email}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Statut */}
                  <td className="px-4 py-3">
                    <TierBadge tier={customer.tier} />
                  </td>

                  {/* Segment */}
                  <td className="px-4 py-3">
                    <RfmBadge segment={customer.rfm_segment} />
                  </td>

                  {/* Points */}
                  <td className="px-4 py-3">
                    <PointsCell points={customer.points} />
                  </td>

                  {/* CA total */}
                  <td className="px-4 py-3 text-sm text-[var(--text3)]">—</td>

                  {/* Dernière visite */}
                  <td className="px-4 py-3 text-sm text-[var(--text3)]">—</td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => router.push(`/dashboard/crm/${customer.id}`)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#a78bfa] border border-[#8b5cf6]/40 hover:bg-[#8b5cf6]/10 transition-colors"
                    >
                      Voir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
