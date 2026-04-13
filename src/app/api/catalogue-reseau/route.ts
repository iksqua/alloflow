import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isItemExpired, isUpcoming } from '@/lib/catalogue-helpers'

async function getAdminProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 401 as const }
  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || !['admin', 'caissier'].includes(profile.role) || !profile.establishment_id) return { error: 403 as const }
  return { userId: user.id, establishmentId: profile.establishment_id }
}

export async function GET() {
  const caller = await getAdminProfile()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const supabase = await createClient()
  const { data: items, error } = await supabase
    .from('establishment_catalog_items')
    .select(`
      *,
      network_catalog_items (
        id, type, name, description, is_mandatory, is_seasonal, expires_at, available_from, status, version, image_url,
        network_catalog_item_data (payload, previous_payload)
      )
    `)
    .eq('establishment_id', caller.establishmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (items ?? []).map((item) => {
    const cat = item.network_catalog_items as {
      is_seasonal?: boolean; expires_at?: string | null
      available_from?: string | null; status?: string
    } | null

    // Seasonal expiry check at read time
    if (cat?.is_seasonal && isItemExpired(cat.expires_at ?? null)) {
      return { ...item, network_catalog_items: { ...cat, status: 'archived' }, is_upcoming: false }
    }
    // Upcoming check at read time
    const upcoming = isUpcoming(cat?.available_from ?? null)
    return { ...item, is_upcoming: upcoming }
  })

  return NextResponse.json({ items: result })
}
