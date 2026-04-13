import { describe, it, expect } from 'vitest'

function initIngredientPayload(payload: Record<string, unknown>) {
  return {
    unit:                    (payload?.unit as string) ?? 'kg',
    category:                (payload?.category as string) ?? '',
    reference_package_price: (payload?.reference_package_price as number | undefined) ?? '' as number | '',
    reference_package_size:  (payload?.reference_package_size as number | undefined) ?? '' as number | '',
  }
}

function buildIngredientPayload(ingPayload: { unit: string; category: string; reference_package_price: number | ''; reference_package_size: number | '' }) {
  const refPrice = Number(ingPayload.reference_package_price)
  const refSize  = Number(ingPayload.reference_package_size)
  const hasRef   = refPrice > 0 && refSize > 0
  return {
    unit: ingPayload.unit,
    ...(ingPayload.category ? { category: ingPayload.category } : {}),
    ...(hasRef ? { reference_package_price: refPrice, reference_package_size: refSize } : {}),
  }
}

describe('initIngredientPayload', () => {
  it('reads reference price from existing payload', () => {
    const result = initIngredientPayload({ unit: 'ml', reference_package_price: 7.45, reference_package_size: 750 })
    expect(result.reference_package_price).toBe(7.45)
    expect(result.reference_package_size).toBe(750)
  })
  it('defaults to empty string when no reference price', () => {
    const result = initIngredientPayload({ unit: 'kg' })
    expect(result.reference_package_price).toBe('')
    expect(result.reference_package_size).toBe('')
  })
})

describe('buildIngredientPayload', () => {
  it('includes reference price when both fields > 0', () => {
    const result = buildIngredientPayload({ unit: 'ml', category: '', reference_package_price: 7.45, reference_package_size: 750 })
    expect(result.reference_package_price).toBe(7.45)
    expect(result.reference_package_size).toBe(750)
  })
  it('omits reference price when one field is empty string', () => {
    const result = buildIngredientPayload({ unit: 'ml', category: '', reference_package_price: '', reference_package_size: 750 })
    expect('reference_package_price' in result).toBe(false)
    expect('reference_package_size' in result).toBe(false)
  })
  it('omits reference price when both empty', () => {
    const result = buildIngredientPayload({ unit: 'ml', category: '', reference_package_price: '', reference_package_size: '' })
    expect('reference_package_price' in result).toBe(false)
  })
})
