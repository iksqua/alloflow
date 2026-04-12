'use client'
import { useState } from 'react'

export type Period = 'today' | '7d' | '30d' | 'custom'

interface PeriodSelectorProps {
  current: Period
  customFrom?: string
  customTo?: string
  onChange: (period: Period, from?: string, to?: string) => void
  loading?: boolean
}

const LABELS: Record<Period, string> = {
  today: "Aujourd'hui",
  '7d':  '7 jours',
  '30d': '30 jours',
  custom: 'Personnalisé',
}

export function PeriodSelector({ current, customFrom, customTo, onChange, loading }: PeriodSelectorProps) {
  const [showCustom, setShowCustom] = useState(false)
  const [from, setFrom]             = useState(customFrom ?? '')
  const [to, setTo]                 = useState(customTo ?? '')

  function handlePeriod(p: Period) {
    if (p === 'custom') { setShowCustom(true); return }
    setShowCustom(false)
    onChange(p)
  }

  function applyCustom() {
    if (!from || !to) return
    setShowCustom(false)
    onChange('custom', from, to)
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      {/* Period tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--surface)' }}>
        {(['today', '7d', '30d', 'custom'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => handlePeriod(p)}
            disabled={loading}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              current === p
                ? 'text-white shadow-sm'
                : 'text-[var(--text3)] hover:text-[var(--text2)]',
              loading ? 'opacity-50 cursor-wait' : '',
            ].join(' ')}
            style={current === p ? { background: 'var(--blue)' } : undefined}
          >
            {LABELS[p]}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      {(showCustom || current === 'custom') && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            max={to || undefined}
            className="px-2.5 py-1.5 rounded-lg text-xs border text-[var(--text1)] bg-[var(--surface)] border-[var(--border)] focus:outline-none focus:border-[var(--blue)]"
          />
          <span className="text-[var(--text4)] text-xs">→</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            min={from || undefined}
            className="px-2.5 py-1.5 rounded-lg text-xs border text-[var(--text1)] bg-[var(--surface)] border-[var(--border)] focus:outline-none focus:border-[var(--blue)]"
          />
          <button
            onClick={applyCustom}
            disabled={!from || !to || loading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-opacity"
            style={{ background: 'var(--blue)' }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  )
}
