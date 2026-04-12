'use client'

import { useState } from 'react'
import type { OrderRow } from '@/lib/analytics/types'
import { ordersToCSV, downloadCSV } from '@/lib/analytics/csv'

type SortKey = 'createdAt' | 'amountHt' | 'amountTtc'
type SortDir = 'asc' | 'desc'

interface ReportTableProps {
  rows: OrderRow[]
  total: number
  totalHt: number
  totalTva: number
  totalTtc: number
}

export function ReportTable({ rows, total, totalHt, totalTva, totalTtc }: ReportTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...rows].sort((a, b) => {
    let av: number
    let bv: number
    if (sortKey === 'createdAt') {
      av = new Date(a.createdAt).getTime()
      bv = new Date(b.createdAt).getTime()
    } else if (sortKey === 'amountHt') {
      av = a.amountHt
      bv = b.amountHt
    } else {
      av = a.amountTtc
      bv = b.amountTtc
    }
    return sortDir === 'asc' ? av - bv : bv - av
  })

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="ml-1 text-slate-600">↕</span>
    return (
      <span className="ml-1 text-blue-400">
        {sortDir === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  function handleExport() {
    const today = new Date().toISOString().slice(0, 10)
    downloadCSV(ordersToCSV(rows), `rapport-ventes-${today}.csv`)
  }

  return (
    <div className="bg-[#0f2744] border border-white/[0.06] rounded-[14px] overflow-hidden">
      {/* Table header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-white/[0.01]">
        <span className="text-sm font-semibold text-slate-200">
          Transactions
          <span className="ml-2 text-xs text-slate-500 font-normal">({total} au total)</span>
        </span>
        <button
          onClick={handleExport}
          disabled={rows.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ↓ Exporter CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-500">
          <span className="text-3xl mb-3">📊</span>
          <p className="text-sm">Aucune transaction sur cette période</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr>
                <th
                  className="text-left text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] bg-white/[0.01] cursor-pointer select-none hover:text-slate-400 transition-colors"
                  onClick={() => handleSort('createdAt')}
                >
                  Date/Heure <SortIcon col="createdAt" />
                </th>
                <th className="text-left text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] bg-white/[0.01] hidden sm:table-cell">
                  Ticket
                </th>
                <th className="text-left text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] bg-white/[0.01]">
                  Produits
                </th>
                <th className="text-left text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] bg-white/[0.01] hidden sm:table-cell">
                  Paiement
                </th>
                <th
                  className="text-right text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] bg-white/[0.01] cursor-pointer select-none hover:text-slate-400 transition-colors hidden md:table-cell"
                  onClick={() => handleSort('amountHt')}
                >
                  HT <SortIcon col="amountHt" />
                </th>
                <th className="text-right text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] bg-white/[0.01] hidden md:table-cell">
                  TVA
                </th>
                <th
                  className="text-right text-[10px] text-slate-500 uppercase tracking-wider px-4 py-3 border-b border-white/[0.06] bg-white/[0.01] cursor-pointer select-none hover:text-slate-400 transition-colors"
                  onClick={() => handleSort('amountTtc')}
                >
                  TTC <SortIcon col="amountTtc" />
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr
                  key={row.id}
                  className={`${i % 2 === 1 ? 'bg-white/[0.015]' : ''} hover:bg-blue-500/[0.04] transition-colors`}
                >
                  <td className="px-4 py-3 text-slate-300 text-xs whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono hidden sm:table-cell">
                    #{row.ticketNumber}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs max-w-[160px] truncate">
                    {row.products || '—'}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {row.paymentMethod === 'card' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400">
                        💳 Carte
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400">
                        💵 Espèces
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-300 text-xs tabular-nums hidden md:table-cell">
                    {row.amountHt.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500 text-xs tabular-nums hidden md:table-cell">
                    {row.tvaAmount.toFixed(2)} €
                  </td>
                  <td className="px-4 py-3 text-right text-slate-200 text-xs tabular-nums font-semibold">
                    {row.amountTtc.toFixed(2)} €
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-blue-500/[0.05] border-t border-white/[0.06]">
                <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-slate-300">
                  Total ({rows.length} ligne{rows.length > 1 ? 's' : ''})
                </td>
                <td className="px-4 py-3 hidden sm:table-cell" />
                <td className="px-4 py-3 hidden sm:table-cell" />
                <td className="px-4 py-3 text-right text-xs font-semibold text-slate-300 tabular-nums hidden md:table-cell">
                  {totalHt.toFixed(2)} €
                </td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-slate-400 tabular-nums hidden md:table-cell">
                  {totalTva.toFixed(2)} €
                </td>
                <td className="px-4 py-3 text-right text-xs font-bold text-blue-400 tabular-nums">
                  {totalTtc.toFixed(2)} €
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
