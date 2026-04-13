import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

async function getFranchiseAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 401 as const }
  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) return { error: 403 as const }
  return { userId: user.id, orgId: profile.org_id }
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getFranchiseAdmin()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const { id } = await params
  const supabase = adminClient()

  const { data: item } = await supabase
    .from('network_catalog_items').select('id, org_id, status, version, available_from').eq('id', id).single()
  if (!item || item.org_id !== caller.orgId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (item.status === 'published')
    return NextResponse.json({ error: 'Déjà publié' }, { status: 409 })
  if (item.status === 'archived')
    return NextResponse.json({ error: 'Item archivé — impossible de republier' }, { status: 409 })

  const { error: pubErr } = await supabase
    .from('network_catalog_items')
    .update({ status: 'published', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (pubErr) return NextResponse.json({ error: pubErr.message }, { status: 500 })

  // Fetch all establishments in this network
  const { data: networkOrgs } = await supabase
    .from('organizations').select('id')
    .or(`id.eq.${caller.orgId},parent_org_id.eq.${caller.orgId}`)
  const orgIds = (networkOrgs ?? []).map((o: { id: string }) => o.id)

  const { data: establishments } = await supabase
    .from('establishments').select('id').in('org_id', orgIds.length > 0 ? orgIds : ['__none__'])
  const estIds = (establishments ?? []).map((e: { id: string }) => e.id)

  if (estIds.length > 0) {
    const isUpcomingItem = item.available_from
      ? item.available_from > new Date().toISOString().split('T')[0]
      : false

    const rows = estIds.map((estId: string) => ({
      establishment_id: estId,
      catalog_item_id:  id,
      is_active:        true,
      current_version:  item.version,
      // Don't notify if item is PROCHAINEMENT — franchisees see it as upcoming, no urgent banner
      notified_at:      isUpcomingItem ? null : new Date().toISOString(),
    }))
    await supabase.from('establishment_catalog_items').upsert(rows, { onConflict: 'establishment_id,catalog_item_id' })
  }

  return NextResponse.json({ ok: true, propagated: estIds.length })
}
