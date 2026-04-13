import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export async function CatalogueNotificationBanner({ establishmentId }: { establishmentId: string }) {
  const supabase = await createClient()

  // Fetch items with notified_at set, then filter JS-side (cross-column comparison)
  const { data: notifiedItems } = await supabase
    .from('establishment_catalog_items')
    .select('notified_at, seen_at')
    .eq('establishment_id', establishmentId)
    .not('notified_at', 'is', null)

  const updatedCount = (notifiedItems ?? []).filter(
    (i: { notified_at: string | null; seen_at: string | null }) =>
      !i.seen_at || new Date(i.seen_at) < new Date(i.notified_at!)
  ).length

  const { data: newOptionalItems } = await supabase
    .from('establishment_catalog_items')
    .select('seen_at, network_catalog_items!inner(is_mandatory)')
    .eq('establishment_id', establishmentId)
    .eq('network_catalog_items.is_mandatory', false)
    .is('seen_at', null)
  const newOptionalCount = (newOptionalItems ?? []).length

  const total = updatedCount + newOptionalCount
  if (total === 0) return null

  const parts: string[] = []
  if (updatedCount > 0) parts.push(`${updatedCount} élément${updatedCount > 1 ? 's' : ''} mis à jour par le siège`)
  if (newOptionalCount > 0) parts.push(`${newOptionalCount} nouveau${newOptionalCount > 1 ? 'x' : ''} produit${newOptionalCount > 1 ? 's' : ''} optionnel${newOptionalCount > 1 ? 's' : ''} disponible${newOptionalCount > 1 ? 's' : ''}`)

  return (
    <Link
      href="/dashboard/catalogue-reseau"
      className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg mx-6 mt-4"
      style={{ background: '#0f1f35', border: '1px solid #1e3a5f', color: '#60a5fa' }}
    >
      <span>📦</span>
      <span>{parts.join(' · ')}</span>
      <span className="ml-auto text-xs opacity-60">Voir →</span>
    </Link>
  )
}
