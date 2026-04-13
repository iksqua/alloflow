import { describe, it, expect } from 'vitest'
import { computeComplianceScore, hasUnseenNotifications, isItemExpired } from '../catalogue-helpers'

describe('computeComplianceScore', () => {
  it('returns 100 when all mandatory items are active', () => {
    expect(computeComplianceScore(3, 3)).toBe(100)
  })
  it('returns 0 when no mandatory items are active', () => {
    expect(computeComplianceScore(0, 3)).toBe(0)
  })
  it('returns 0 when no mandatory items exist', () => {
    expect(computeComplianceScore(0, 0)).toBe(0)
  })
  it('returns 67 for 2 out of 3', () => {
    expect(computeComplianceScore(2, 3)).toBe(67)
  })
})

describe('hasUnseenNotifications', () => {
  it('returns true when seen_at is null and notified_at is set', () => {
    expect(hasUnseenNotifications(new Date().toISOString(), null)).toBe(true)
  })
  it('returns true when seen_at is before notified_at', () => {
    const earlier = new Date(Date.now() - 10000).toISOString()
    const later   = new Date().toISOString()
    expect(hasUnseenNotifications(later, earlier)).toBe(true)
  })
  it('returns false when seen_at is after notified_at', () => {
    const earlier = new Date(Date.now() - 10000).toISOString()
    const later   = new Date().toISOString()
    expect(hasUnseenNotifications(earlier, later)).toBe(false)
  })
  it('returns false when notified_at is null', () => {
    expect(hasUnseenNotifications(null, null)).toBe(false)
  })
})

describe('isItemExpired', () => {
  it('returns true for past date', () => {
    expect(isItemExpired('2020-01-01')).toBe(true)
  })
  it('returns false for future date', () => {
    expect(isItemExpired('2099-01-01')).toBe(false)
  })
  it('returns false when expires_at is null', () => {
    expect(isItemExpired(null)).toBe(false)
  })
})
