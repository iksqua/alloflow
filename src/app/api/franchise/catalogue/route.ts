import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createCatalogueItemSchema } from '@/lib/validations/catalogue'

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

export async function GET(_req?: NextRequest) {
  const caller = await getFranchiseAdmin()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const supabase = adminClient()
  const { data: items, error } = await supabase
    .from('network_catalog_items')
    .select('*, network_catalog_item_data(payload, previous_payload), catalog_item_comments(count)')
    .eq('org_id', caller.orgId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const mapped = (items ?? []).map((item) => {
    const raw = item.catalog_item_comments as { count: string | number }[] | null
    return { ...item, comment_count: Number(raw?.[0]?.count ?? 0), catalog_item_comments: undefined }
  })
  return NextResponse.json({ items: mapped })
}

export async function POST(req: NextRequest) {
  const caller = await getFranchiseAdmin()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const body = createCatalogueItemSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { payload, ...itemFields } = body.data
  const supabase = adminClient()

  const { data: item, error: itemErr } = await supabase
    .from('network_catalog_items')
    .insert({ ...itemFields, org_id: caller.orgId, status: 'draft' })
    .select().single()

  if (itemErr || !item) return NextResponse.json({ error: itemErr?.message ?? 'Erreur' }, { status: 500 })

  const { error: dataErr } = await supabase.from('network_catalog_item_data').insert({ catalog_item_id: item.id, payload })
  if (dataErr) {
    await supabase.from('network_catalog_items').delete().eq('id', item.id)
    return NextResponse.json({ error: dataErr.message }, { status: 500 })
  }

  return NextResponse.json({ item }, { status: 201 })
}
