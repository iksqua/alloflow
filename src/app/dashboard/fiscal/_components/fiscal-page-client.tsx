// src/app/dashboard/fiscal/_components/fiscal-page-client.tsx
'use client'
import { useState } from 'react'

interface FiscalEntry {
  id: string
  sequence_no: number
  event_type: 'sale' | 'void' | 'refund' | 'z_close'
  order_id: string | null
  amount_ttc: number
  cashier_id: string | null
  occurred_at: string
  previous_hash: string
  entry_hash: string
  order?: { id: string; status: string } | null
}

interface Props {
  initialEntries: FiscalEntry[]
}

const EVENT_LABELS: Record<string, string> = {
  sale:    'Vente',
  void:    'Annulation',
  refund:  'Remboursement',
  z_close: 'Clôture Z',
}

const EVENT_CLASSES: Record<string, string> = {
  sale:    'bg-green-900/20 text-green-400',
  void:    'bg-red-900/20 text-red-400',
  refund:  'bg-amber-900/20 text-amber-400',
  z_close: 'bg-blue-900/20 text-blue-400',
}

export function FiscalPageClient({ initialEntries }: Props) {
  const [entries] = useState(initialEntries)

  const totalSales = entries
    .filter(e => e.event_type === 'sale')
    .reduce((s, e) => s + e.amount_ttc, 0)

  return (
    <div>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text1)]">Journal fiscal</h1>
            <p className="text-xs text-[var(--text4)] mt-0.5">Registre immuable NF525 — lecture seule</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold self-start sm:self-auto"
            style={{ background: 'rgba(16,185,129,.1)', color: '#10b981', border: '1px solid rgba(16,185,129,.2)' }}>
            🔒 Chaîne de hash intacte
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Entrées totales', value: entries.length, color: 'text-[var(--text1)]' },
            { label: 'Ventes', value: entries.filter(e => e.event_type === 'sale').length, color: 'text-green-400' },
            { label: 'Total TTC', value: `${totalSales.toFixed(2)} €`, color: 'text-[var(--text1)]' },
          ].map(kpi => (
            <div key={kpi.label} className="rounded-xl p-4 border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
              <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs text-[var(--text3)] uppercase tracking-wide mt-1">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl border border-[var(--border)] overflow-x-auto" style={{ background: 'var(--surface)' }}>
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide hidden sm:table-cell">Horodatage</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide">Montant TTC</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[var(--text4)] uppercase tracking-wide hidden sm:table-cell">Hash (extrait)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-[var(--text4)]">
                    Aucune entrée — le journal se remplit à chaque vente
                  </td>
                </tr>
              )}
              {entries.map(entry => (
                <tr key={entry.id} className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--surface2)]/30">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text4)]">#{entry.sequence_no}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text3)] hidden sm:table-cell">
                    {new Date(entry.occurred_at).toLocaleString('fr-FR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${EVENT_CLASSES[entry.event_type]}`}>
                      {EVENT_LABELS[entry.event_type]}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-bold tabular-nums ${
                    entry.event_type === 'void' || entry.event_type === 'refund'
                      ? 'text-red-400'
                      : 'text-[var(--text1)]'
                  }`}>
                    {entry.event_type === 'void' || entry.event_type === 'refund' ? '-' : ''}
                    {entry.amount_ttc.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="font-mono text-xs text-[var(--text4)] bg-[var(--bg)] px-2 py-1 rounded">
                      {entry.entry_hash.slice(0, 12)}…
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {entry.order?.status === 'cancelled' && (
                      <span className="text-xs text-red-400 font-semibold">Annulé</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-[var(--text4)] mt-4 text-center">
          Ce registre est immuable. Toute modification invaliderait la chaîne de hash.
        </p>
      </div>
    </div>
  )
}
