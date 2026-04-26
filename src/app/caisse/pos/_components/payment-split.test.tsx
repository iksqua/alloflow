import { describe, it, expect } from 'vitest'
import { computeSplitAmounts } from './payment-split'
import type { LocalItem } from '../types'

const item = (id: string, ht: number, tva: number, qty = 1): LocalItem => ({
  productId: id, productName: 'Test', emoji: null,
  unitPriceHt: ht, tvaRate: tva, quantity: qty,
})

describe('computeSplitAmounts', () => {
  it('distribue deux articles assignés sans remise', () => {
    const items = [item('a', 3, 10), item('b', 2, 5.5)]
    const totalFinal = 3.30 + 2.11  // 3*1.10 + 2*1.055
    const assignments = new Map([['a', 'P1'], ['b', 'P2']])
    const methods = new Map<string, 'card' | 'cash'>([['P1', 'cash'], ['P2', 'card']])
    const result = computeSplitAmounts(items, null, 0, assignments, ['P1', 'P2'], methods, totalFinal)
    expect(result[0]).toEqual({ label: 'P1', amount: 3.30, method: 'cash' })
    expect(result[1]).toEqual({ label: 'P2', amount: 2.11, method: 'card' })
    expect(result[0].amount + result[1].amount).toBeCloseTo(5.41, 2)
  })

  it('absorbe l\'arrondi sur la dernière personne', () => {
    // 1€ HT + 3% TVA = 1.03 TTC. Split equally: 0.515 each → not exact cents.
    // P1 and P2 have equal shares. P1 gets 0.51, P2 (last) absorbs remainder = 0.52.
    // Total must still be exactly 1.03.
    const items = [item('a', 1, 3)]
    const assignments = new Map<string, string | null>([['a', null]])  // unassigned → distributed equally
    const methods = new Map<string, 'card' | 'cash'>([['P1', 'card'], ['P2', 'card']])
    const result = computeSplitAmounts(items, null, 0, assignments, ['P1', 'P2'], methods, 1.03)
    // Sum must equal total exactly (not just approximately)
    expect(result[0].amount + result[1].amount).toBeCloseTo(1.03, 2)
    // One person gets 0.51, the other 0.52 (last absorbs rounding)
    const amounts = result.map(p => p.amount).sort((a, b) => a - b)
    expect(amounts[0]).toBeCloseTo(0.51, 2)
    expect(amounts[1]).toBeCloseTo(0.52, 2)
  })

  it('distribue les articles non assignés équitablement', () => {
    const items = [item('a', 10, 10), item('b', 10, 10)]
    const totalFinal = 11 + 11  // no discount
    const assignments = new Map([['a', 'P1']])
    const methods = new Map<string, 'card' | 'cash'>([['P1', 'card'], ['P2', 'card']])
    const result = computeSplitAmounts(items, null, 0, assignments, ['P1', 'P2'], methods, totalFinal)
    expect(result[0].amount).toBeCloseTo(16.50, 2)
    expect(result[1].amount).toBeCloseTo(5.50, 2)
  })

  it('applique une remise montant fixe HT pro-rata (aligne avec le serveur)', () => {
    // 10€ HT + 20% TVA × 2 → totalBrut=24€ TTC
    // Remise 4€ sur HT : discountedHt=16, tax proratisée=3.20 → total=19.20€ TTC
    // precomputedTotal=19.20 (calculé côté client comme le serveur le fait)
    const items = [item('a', 10, 20), item('b', 10, 20)]
    const assignments = new Map([['a', 'P1'], ['b', 'P2']])
    const methods = new Map<string, 'card' | 'cash'>([['P1', 'card'], ['P2', 'card']])
    const result = computeSplitAmounts(items, { type: 'amount', value: 4 }, 0, assignments, ['P1', 'P2'], methods, 19.20)
    expect(result[0].amount).toBeCloseTo(9.60, 2)
    expect(result[1].amount).toBeCloseTo(9.60, 2)
    expect(result[0].amount + result[1].amount).toBeCloseTo(19.20, 2)
  })

  it('cas dégénéré : 1 seule personne reçoit le total', () => {
    const items = [item('a', 10, 20), item('b', 5, 10)]
    const totalFinal = 12 + 5.5  // 10*1.20 + 5*1.10
    const assignments = new Map([['a', 'P1'], ['b', 'P1']])
    const methods = new Map<string, 'card' | 'cash'>([['P1', 'card']])
    const result = computeSplitAmounts(items, null, 0, assignments, ['P1'], methods, totalFinal)
    expect(result[0].amount).toBeCloseTo(17.5, 2)
  })
})
