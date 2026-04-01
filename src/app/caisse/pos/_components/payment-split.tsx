'use client'
// src/app/caisse/pos/_components/payment-split.tsx
import { useState } from 'react'
import type { LocalItem, SplitPerson } from '../types'

function lineTtc(item: LocalItem): number {
  return item.unitPriceHt * (1 + item.tvaRate / 100) * item.quantity
}

export function computeSplitAmounts(
  items: LocalItem[],
  discount: { type: 'percent' | 'amount'; value: number } | null,
  loyaltyDiscount: number,
  assignments: Map<string, string | null>,
  personLabels: string[],
  personMethods: Map<string, 'card' | 'cash'>
): SplitPerson[] {
  if (personLabels.length === 0) return []

  const totalBrut = items.reduce((s, i) => s + lineTtc(i), 0)

  let discountEur = 0
  if (discount) {
    discountEur = discount.type === 'percent'
      ? totalBrut * (discount.value / 100)
      : discount.value
  }
  const totalFinal = Math.max(0, totalBrut - discountEur - loyaltyDiscount)

  const personBrut = new Map<string, number>()
  for (const label of personLabels) personBrut.set(label, 0)

  let unassignedBrut = 0
  for (const item of items) {
    const ttc = lineTtc(item)
    const assignedTo = assignments.get(item.productId) ?? null
    if (assignedTo && personLabels.includes(assignedTo)) {
      personBrut.set(assignedTo, (personBrut.get(assignedTo) ?? 0) + ttc)
    } else {
      unassignedBrut += ttc
    }
  }

  if (unassignedBrut > 0) {
    const share = unassignedBrut / personLabels.length
    for (const label of personLabels) {
      personBrut.set(label, (personBrut.get(label) ?? 0) + share)
    }
  }

  const results: SplitPerson[] = []
  let sumSoFar = 0
  for (let i = 0; i < personLabels.length; i++) {
    const label = personLabels[i]
    const brut = personBrut.get(label) ?? 0
    const ratio = totalBrut > 0 ? brut / totalBrut : 1 / personLabels.length
    const isLast = i === personLabels.length - 1
    let amount: number
    if (isLast) {
      amount = Math.round((totalFinal - sumSoFar) * 100) / 100
    } else {
      amount = Math.round(totalFinal * ratio * 100) / 100
      sumSoFar += amount
    }
    results.push({ label, amount: Math.max(0, amount), method: personMethods.get(label) ?? 'card' })
  }
  return results
}

const PERSON_COLORS: Record<string, string> = {
  P1: '#1d4ed8', P2: '#7c3aed', P3: '#0891b2',
  P4: '#d97706', P5: '#dc2626', P6: '#059669',
}

interface PaymentSplitProps {
  items: LocalItem[]
  discount: { type: 'percent' | 'amount'; value: number } | null
  loyaltyDiscount: number
  totalFinal: number
  onConfirm: (persons: SplitPerson[]) => void
  onBack: () => void
}

export function PaymentSplit({ items, discount, loyaltyDiscount, totalFinal, onConfirm, onBack }: PaymentSplitProps) {
  const [persons, setPersons] = useState<string[]>(['P1', 'P2'])
  const [assignments, setAssignments] = useState<Map<string, string | null>>(
    () => new Map(items.map(i => [i.productId, null]))
  )
  const [methods, setMethods] = useState<Map<string, 'card' | 'cash'>>(
    () => new Map(persons.map(p => [p, 'card' as const]))
  )

  function addPerson() {
    if (persons.length >= 10) return
    const label = `P${persons.length + 1}`
    setPersons(prev => [...prev, label])
    setMethods(prev => new Map([...prev, [label, 'card']]))
  }

  function cycleAssignment(productId: string) {
    setAssignments(prev => {
      const current = prev.get(productId) ?? null
      const idx = current === null ? 0 : persons.indexOf(current) + 1
      const next = idx >= persons.length ? null : persons[idx]
      return new Map([...prev, [productId, next]])
    })
  }

  function toggleMethod(label: string) {
    setMethods(prev => new Map([...prev, [label, prev.get(label) === 'card' ? 'cash' : 'card']]))
  }

  const splitPersons = computeSplitAmounts(items, discount, loyaltyDiscount, assignments, persons, methods)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text4)' }}>
          Assigner les articles
        </span>
        <button
          onClick={addPerson}
          disabled={persons.length >= 10}
          className="text-xs font-semibold px-3 py-1 rounded-lg"
          style={{ background: 'rgba(29,78,216,0.15)', color: '#93c5fd', border: '1px solid rgba(29,78,216,0.4)' }}
        >
          + Personne
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {items.map(item => {
          const assignedTo = assignments.get(item.productId) ?? null
          const color = assignedTo ? (PERSON_COLORS[assignedTo] ?? '#64748b') : '#334155'
          return (
            <button
              key={item.productId}
              onClick={() => cycleAssignment(item.productId)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors"
              style={{ background: 'var(--surface2)' }}
            >
              <span className="text-base">{item.emoji ?? '📦'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text1)' }}>{item.productName}</div>
                <div className="text-xs" style={{ color: 'var(--text4)' }}>
                  ×{item.quantity} · {lineTtc(item).toFixed(2)} €
                </div>
              </div>
              <span
                className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ background: color, color: assignedTo ? 'white' : '#94a3b8' }}
              >
                {assignedTo ?? '—'}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2">
        {splitPersons.map(p => (
          <div
            key={p.label}
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
          >
            <span
              className="text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0"
              style={{ background: PERSON_COLORS[p.label] ?? '#334155', color: 'white' }}
            >
              {p.label}
            </span>
            <span className="flex-1 text-base font-bold" style={{ color: 'var(--text1)' }}>
              {p.amount.toFixed(2).replace('.', ',')} €
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => p.method === 'cash' && toggleMethod(p.label)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                style={p.method === 'card'
                  ? { background: '#1d4ed8', color: 'white' }
                  : { background: 'var(--surface)', color: 'var(--text4)', border: '1px solid var(--border)' }}
              >
                💳 CB
              </button>
              <button
                onClick={() => p.method === 'card' && toggleMethod(p.label)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                style={p.method === 'cash'
                  ? { background: '#166534', color: '#4ade80' }
                  : { background: 'var(--surface)', color: 'var(--text4)', border: '1px solid var(--border)' }}
              >
                💵 Espèces
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => onConfirm(splitPersons)}
        disabled={splitPersons.some(p => p.amount <= 0)}
        className="w-full py-4 rounded-xl text-base font-bold text-white disabled:opacity-40"
        style={{ background: 'var(--green)' }}
      >
        Encaisser {splitPersons.map(p => p.label).join(' + ')} →
      </button>
      <button
        onClick={onBack}
        className="w-full py-2 text-sm"
        style={{ color: 'var(--text4)' }}
      >
        ← Retour
      </button>
    </div>
  )
}
