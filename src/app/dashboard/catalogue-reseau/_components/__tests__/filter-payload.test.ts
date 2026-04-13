import { describe, it, expect } from 'vitest'

const HIDDEN_PAYLOAD_KEYS = ['reference_package_price', 'reference_package_size']

function filterPayloadForDisplay(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([k]) => !HIDDEN_PAYLOAD_KEYS.includes(k))
  )
}

describe('filterPayloadForDisplay', () => {
  it('removes reference price keys', () => {
    expect(filterPayloadForDisplay({
      unit: 'ml', reference_package_price: 7.45, reference_package_size: 750,
    })).toEqual({ unit: 'ml' })
  })
  it('leaves other keys untouched', () => {
    expect(filterPayloadForDisplay({ unit: 'kg', category: 'Farines' }))
      .toEqual({ unit: 'kg', category: 'Farines' })
  })
})
