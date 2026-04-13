// src/app/api/franchise/catalogue/[id]/duplicate/route.ts
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

  // Fetch original item + data
  const { data: original } = await supabase
    .from('network_catalog_items')
    .select('*, network_catalog_item_data(payload)')
    .eq('id', id)
    .single()

  if (!original || original.org_id !== caller.orgId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Create duplicate — always draft, version reset to 1
  const { data: copy, error: copyErr } = await supabase
    .from('network_catalog_items')
    .insert({
      org_id:         original.org_id,
      type:           original.type,
      name:           `Copie de ${original.name}`,
      description:    original.description,
      is_mandatory:   original.is_mandatory,
      is_seasonal:    original.is_seasonal,
      expires_at:     original.expires_at,
      available_from: original.available_from,
      status:         'draft',
      version:        1,
    })
    .select('*, network_catalog_item_data(payload)')
    .single()

  if (copyErr || !copy) return NextResponse.json({ error: copyErr?.message ?? 'Failed to duplicate' }, { status: 500 })

  // Copy payload data
  const rawData = original.network_catalog_item_data
  const originalData = Array.isArray(rawData) ? (rawData[0] ?? null) as { payload: Record<string, unknown> } | null : rawData as { payload: Record<string, unknown> } | null
  if (originalData?.payload) {
    const { error: dataErr } = await supabase
      .from('network_catalog_item_data')
      .insert({ catalog_item_id: copy.id, payload: originalData.payload, previous_payload: null })
    if (dataErr) {
      // Compensate: delete the orphaned item row we just created
      await supabase.from('network_catalog_items').delete().eq('id', copy.id)
      return NextResponse.json({ error: dataErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ item: copy }, { status: 201 })
}
