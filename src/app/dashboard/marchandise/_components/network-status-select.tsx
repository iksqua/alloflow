'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { NetworkStatus } from './types'

const OPTIONS: { value: NetworkStatus; label: string; dot: string; style: React.CSSProperties }[] = [
  {
    value: 'active',
    label: 'Actif',
    dot: '●',
    style: { background: 'rgba(16,185,129,.1)', color: 'var(--green)', border: '1px solid rgba(16,185,129,.25)' },
  },
  {
    value: 'inactive',
    label: 'Inactif',
    dot: '○',
    style: { background: 'rgba(100,116,139,.1)', color: 'var(--text4)', border: '1px solid rgba(100,116,139,.2)' },
  },
  {
    value: 'coming_soon',
    label: 'Prochainement',
    dot: '◑',
    style: { background: 'rgba(168,85,247,.1)', color: '#d8b4fe', border: '1px solid rgba(168,85,247,.25)' },
  },
  {
    value: 'not_shared',
    label: '+ Partager',
    dot: '',
    style: { background: 'transparent', color: 'var(--text4)', border: '1px dashed var(--border)' },
  },
]

interface Props {
  value: NetworkStatus
  table: 'stock_items' | 'recipes'
  id: string
  onUpdate?: (value: NetworkStatus) => void
  readOnly?: boolean
}

export function NetworkStatusSelect({ value, table, id, onUpdate, readOnly }: Props) {
  const [current, setCurrent] = useState<NetworkStatus>(value)
  const [open, setOpen] = useState(false)

  const option = OPTIONS.find(o => o.value === current) ?? OPTIONS[3]

  async function handleSelect(next: NetworkStatus) {
    setOpen(false)
    if (next === current) return
    setCurrent(next)
    onUpdate?.(next)
    const supabase = createClient()
    await supabase.from(table).update({ network_status: next }).eq('id', id)
  }

  if (readOnly) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap"
        style={option.style}
      >
        {option.dot && <span>{option.dot}</span>}
        {option.label}
      </span>
    )
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer"
        style={option.style}
      >
        {option.dot && <span>{option.dot}</span>}
        {option.label}
        <span className="ml-0.5 opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute left-0 top-full mt-1 z-20 rounded-xl overflow-hidden shadow-lg min-w-[160px]"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold hover:bg-[var(--surface2)] transition-colors text-left"
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                  style={{ background: opt.style.background as string, color: opt.style.color as string }}
                >
                  {opt.dot || '+'}
                </span>
                <span style={{ color: opt.style.color as string }}>{opt.label}</span>
                {opt.value === current && <span className="ml-auto text-[var(--blue)]">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
