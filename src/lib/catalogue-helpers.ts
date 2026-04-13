/** score = actifs / total mandatory. Returns 0 if no mandatory items. */
export function computeComplianceScore(activeCount: number, totalMandatory: number): number {
  if (totalMandatory === 0) return 0
  return Math.round((activeCount / totalMandatory) * 100)
}

/** true if notified_at is set and (seen_at is null OR seen_at < notified_at) */
export function hasUnseenNotifications(
  notifiedAt: string | null,
  seenAt: string | null
): boolean {
  if (!notifiedAt) return false
  if (!seenAt) return true
  return new Date(seenAt) < new Date(notifiedAt)
}

/** true if expires_at is a past date */
export function isItemExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}

/** true if available_from is set and is strictly in the future */
export function isUpcoming(availableFrom: string | null): boolean {
  if (!availableFrom) return false
  // Compare date strings directly (YYYY-MM-DD) — no time zone issues
  const today = new Date().toISOString().split('T')[0]
  return availableFrom > today
}
