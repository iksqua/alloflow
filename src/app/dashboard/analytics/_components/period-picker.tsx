'use client'

import { useState, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface PeriodPickerProps {
  currentPeriod: string
  customFrom?: string
  customTo?: string
  establishments: { id: string; name: string }[]
  currentEstablishment?: string
}

const LABELS: Record<string, string> = {
  today:  "Aujourd'hui",
  '7d':   '7 jours',
  '30d':  '30 jours',
  custom: 'Personnalisé',
}

function PeriodPickerInner({ currentPeriod, customFrom, customTo, establishments, currentEstablishment }: PeriodPickerProps) {
  const router   = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [showCustom, setShowCustom] = useState(currentPeriod === 'custom')
  const [from, setFrom] = useState(customFrom ?? '')
  const [to, setTo]     = useState(customTo ?? '')

  function navigate(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v)
      else params.delete(k)
    }
    router.push(pathname + '?' + params.toString())
  }

  function handlePeriod(p: string) {
    if (p === 'custom') { setShowCustom(true); return }
    setShowCustom(false)
    navigate({ period: p, from: '', to: '' })
  }

  function applyCustom() {
    if (!from || !to) return
    setShowCustom(false)
    navigate({ period: 'custom', from, to })
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 flex-wrap">
      <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--surface)' }}>
        {(['today', '7d', '30d', 'custom'] as const).map(p => (
          <button
            key={p}
            onClick={() => handlePeriod(p)}
            className={[
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              currentPeriod === p
                ? 'text-white shadow-sm'
                : 'text-[var(--text3)] hover:text-[var(--text2)]',
            ].join(' ')}
            style={currentPeriod === p ? { background: 'var(--blue)' } : undefined}
          >
            {LABELS[p]}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      {(showCustom || currentPeriod === 'custom') && (
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
            disabled={!from || !to}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition-opacity"
            style={{ background: 'var(--blue)' }}
          >
            OK
          </button>
        </div>
      )}

      {/* Establishment selector — franchise_admin only */}
      {establishments.length > 0 && (
        <select
          value={currentEstablishment ?? ''}
          onChange={e => navigate({ site: e.target.value })}
          className="px-2.5 py-1.5 rounded-lg text-xs border text-[var(--text1)] bg-[var(--surface)] border-[var(--border)] focus:outline-none focus:border-[var(--blue)]"
        >
          <option value="">Tous les sites</option>
          {establishments.map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}

export function PeriodPicker(props: PeriodPickerProps) {
  return (
    <Suspense fallback={<div className="h-7" />}>
      <PeriodPickerInner {...props} />
    </Suspense>
  )
}
