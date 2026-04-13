import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isItemExpired } from '@/lib/catalogue-helpers'

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
        id, type, name, description, is_mandatory, is_seasonal, expires_at, status, version,
        network_catalog_item_data (payload, previous_payload)
      )
    `)
    .eq('establishment_id', caller.establishmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Check seasonal expiry at read time
  const result = (items ?? []).map((item) => {
    const catalogItem = item.network_catalog_items as { is_seasonal?: boolean; expires_at?: string | null; status?: string } | null
    if (catalogItem?.is_seasonal && isItemExpired(catalogItem.expires_at ?? null)) {
      return { ...item, network_catalog_items: { ...catalogItem, status: 'archived' } }
    }
    return item
  })

  return NextResponse.json({ items: result })
}
