'use client'
import { useState } from 'react'
import type { LocalTicket } from '../types'

interface DiscountModalProps {
  ticket: LocalTicket
  onApply: (discount: { type: 'percent' | 'amount'; value: number }) => void
  onClose: () => void
}

const QUICK_DISCOUNTS = [5, 10, 15, 20]

export function DiscountModal({ ticket, onApply, onClose }: DiscountModalProps) {
  const [type, setType] = useState<'percent' | 'amount'>('percent')
  const [value, setValue] = useState('')

  // Calcul du total TTC du ticket pour valider la remise en €
  const orderTotal = ticket.items.reduce((sum, item) => {
    const lineHt = item.unitPriceHt * item.quantity
    return sum + lineHt + lineHt * (item.tvaRate / 100)
  }, 0)

  const handleApply = () => {
    const v = parseFloat(value.replace(',', '.'))
    if (!v || v <= 0) return
    if (type === 'amount') {
      // Plafonner la remise : minimum 0,01 € restant
      const capped = Math.min(v, Math.max(0, orderTotal - 0.01))
      if (capped <= 0) return
      onApply({ type, value: Math.round(capped * 100) / 100 })
      return
    }
    if (type === 'percent') {
      // Limiter à 100 %
      const capped = Math.min(v, 100)
      onApply({ type, value: capped })
      return
    }
    onApply({ type, value: v })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-[var(--text1)]">Appliquer une remise</h3>
          <button onClick={onClose} className="text-[var(--text4)] hover:text-[var(--text2)] text-xl">×</button>
        </div>

        {/* Type */}
        <div className="flex gap-2 mb-4">
          {(['percent', 'amount'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={[
                'flex-1 h-10 rounded-lg text-sm font-medium border transition-colors',
                type === t
                  ? 'border-[var(--blue)] bg-[var(--blue-light)] text-[var(--text1)]'
                  : 'border-[var(--border)] text-[var(--text3)] hover:bg-[var(--surface2)]',
              ].join(' ')}
            >
              {t === 'percent' ? 'En %' : 'En €'}
            </button>
          ))}
        </div>

        {/* Raccourcis % */}
        {type === 'percent' && (
          <div className="flex gap-2 mb-4">
            {QUICK_DISCOUNTS.map((pct) => (
              <button
                key={pct}
                onClick={() => setValue(String(pct))}
                className="flex-1 h-9 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)] hover:border-[var(--blue)] transition-colors"
              >
                {pct}%
              </button>
            ))}
          </div>
        )}

        {/* Input valeur */}
        <input
          type="number"
          step={type === 'percent' ? '1' : '0.01'}
          min="0"
          max={type === 'percent' ? '100' : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={type === 'percent' ? 'Ex: 10' : 'Ex: 5,00'}
          className="w-full h-12 px-4 rounded-xl text-lg text-center bg-[var(--surface2)] border border-[var(--border)] text-[var(--text1)] focus:outline-none focus:border-[var(--blue)] mb-4"
          autoFocus
        />

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-10 rounded-lg text-sm border border-[var(--border)] text-[var(--text2)] hover:bg-[var(--surface2)]"
          >
            Annuler
          </button>
          <button
            onClick={handleApply}
            disabled={!value || parseFloat(value) <= 0}
            className="flex-1 h-10 rounded-lg text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90"
            style={{ background: 'var(--blue)' }}
          >
            Appliquer
          </button>
        </div>
      </div>
    </div>
  )
}
