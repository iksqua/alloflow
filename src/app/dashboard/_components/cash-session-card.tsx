'use client'
import Link from 'next/link'
import type { DashboardData } from '@/app/dashboard/_lib/fetch-dashboard-data'

interface Props {
  cashSession: DashboardData['cashSession']
}

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €'
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diff < 60) return `il y a ${diff} min`
  return `il y a ${Math.floor(diff / 60)}h`
}

export function CashSessionCard({ cashSession }: Props) {
  if (!cashSession) {
    return (
      <div
        className="rounded-xl border p-4 flex items-center gap-3"
        style={{ background: 'var(--surface)', borderColor: 'rgba(239,68,68,0.3)' }}
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'var(--red)' }} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--text1)]">Caisse fermée</div>
          <div className="text-xs text-[var(--text3)]">Aucune session ouverte aujourd'hui</div>
        </div>
        <Link
          href="/caisse"
          className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white flex-shrink-0 transition-opacity hover:opacity-80"
          style={{ background: 'var(--blue)' }}
        >
          Ouvrir →
        </Link>
      </div>
    )
  }

  const isOpen = cashSession.status === 'open'

  return (
    <div
      className="rounded-xl border p-4 flex items-center gap-3 flex-wrap"
      style={{
        background: 'var(--surface)',
        borderColor: isOpen ? 'rgba(16,185,129,0.35)' : 'var(--border)',
      }}
    >
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: isOpen ? 'var(--green)' : 'var(--text4)' }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text1)]">
            {isOpen ? 'Caisse ouverte' : 'Caisse fermée'}
          </span>
          {cashSession.openedAt && (
            <span className="text-[11px] text-[var(--text3)]">{timeAgo(cashSession.openedAt)}</span>
          )}
        </div>
        <div className="text-xs text-[var(--text3)]">
          Fond d'ouverture : {fmt(cashSession.openingFloat)}
          {cashSession.totalSales != null && (
            <> · Ventes : <span className="text-[var(--text2)] font-medium">{fmt(cashSession.totalSales)}</span></>
          )}
        </div>
      </div>
      <Link
        href="/caisse"
        className="text-xs px-3 py-1.5 rounded-lg font-medium text-[var(--text2)] border border-[var(--border)] hover:bg-[var(--surface2)] transition-colors flex-shrink-0"
      >
        Caisse →
      </Link>
    </div>
  )
}
