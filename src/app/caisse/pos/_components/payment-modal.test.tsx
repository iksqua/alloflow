import { describe, it, expect } from 'vitest'
import { computeTotal, computeTotalBeforeLoyalty } from './payment-modal'
import type { LocalTicket, LoyaltyReward } from '../types'

const makeTicket = (items: Array<{ ht: number; tva: number; qty?: number }>, discount?: { type: 'percent' | 'amount'; value: number }): LocalTicket => ({
  tableId: null,
  note: '',
  items: items.map((i, idx) => ({
    productId: `p${idx}`,
    productName: 'Test',
    emoji: null,
    unitPriceHt: i.ht,
    tvaRate: i.tva,
    quantity: i.qty ?? 1,
  })),
  discount: discount ?? null,
})

describe('computeTotalBeforeLoyalty', () => {
  it('calcule TTC sans remise', () => {
    // 10€ HT + 20% TVA = 12€ TTC
    const ticket = makeTicket([{ ht: 10, tva: 20 }])
    expect(computeTotalBeforeLoyalty(ticket)).toBeCloseTo(12, 2)
  })

  it('applique une remise en % sur le HT', () => {
    // 10€ HT - 10% = 9€ HT ; TVA proratisée → 9 * 1.20 = 10.80
    const ticket = makeTicket([{ ht: 10, tva: 20 }], { type: 'percent', value: 10 })
    expect(computeTotalBeforeLoyalty(ticket)).toBeCloseTo(10.80, 2)
  })

  it('applique une remise en montant fixe', () => {
    // 10€ HT - 2€ = 8€ HT ; TVA proratisée → 8 * 1.20 = 9.60
    const ticket = makeTicket([{ ht: 10, tva: 20 }], { type: 'amount', value: 2 })
    expect(computeTotalBeforeLoyalty(ticket)).toBeCloseTo(9.60, 2)
  })
})

describe('computeTotal', () => {
  it('retourne le même total sans reward', () => {
    const ticket = makeTicket([{ ht: 10, tva: 20 }])
    expect(computeTotal(ticket, null)).toBeCloseTo(12, 2)
  })

  it('applique une remise fidélité en %', () => {
    // 12€ TTC - 10% = 10.80€
    const ticket = makeTicket([{ ht: 10, tva: 20 }])
    const reward: LoyaltyReward = { id: 'r1', type: 'percent', value: 10, name: 'Test', points_required: 100 }
    expect(computeTotal(ticket, reward)).toBeCloseTo(10.80, 2)
  })

  it('ne descend pas en dessous de 0', () => {
    const ticket = makeTicket([{ ht: 1, tva: 0 }])
    const reward: LoyaltyReward = { id: 'r1', type: 'fixed', value: 100, name: 'Test', points_required: 100 }
    expect(computeTotal(ticket, reward)).toBe(0)
  })
})
