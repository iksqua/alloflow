'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

interface PeriodPickerProps {
  currentPeriod: string
  establishments: { id: string; name: string }[]
  currentEstablishment?: string
}

function PeriodPickerInner({ currentPeriod, establishments, currentEstablishment }: PeriodPickerProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const periods = [
    { value: 'today', label: "Aujourd'hui" },
    { value: '7d', label: '7 jours' },
    { value: '30d', label: '30 jours' },
    { value: 'month', label: 'Mois' },
  ]

  function navigate(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    router.push(pathname + '?' + params.toString())
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Period pills */}
      <div className="flex items-center gap-1">
        {periods.map((p) => (
          <button
            key={p.value}
            onClick={() => navigate('period', p.value)}
            className={
              currentPeriod === p.value
                ? 'px-3 py-1 rounded-full text-xs font-semibold bg-blue-500 text-white'
                : 'px-3 py-1 rounded-full text-xs font-semibold bg-white/5 text-slate-500 border border-white/10 hover:bg-white/10 transition-colors'
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Site selector */}
      {establishments.length > 0 && (
        <select
          value={currentEstablishment ?? ''}
          onChange={(e) => navigate('site', e.target.value)}
          className="text-xs rounded-lg px-2 py-1 border border-white/10 bg-white/5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Tous les sites</option>
          {establishments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
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
