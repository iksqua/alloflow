import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createCatalogueItemSchema } from '@/lib/validations/catalogue'

async function getFranchiseAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'franchise_admin' || !profile.org_id) return null
  return { userId: user.id, orgId: profile.org_id }
}

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const caller = await getFranchiseAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = adminClient()
  const { data: items, error } = await supabase
    .from('network_catalog_items')
    .select('*, network_catalog_item_data(payload, previous_payload)')
    .eq('org_id', caller.orgId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: items ?? [] })
}

export async function POST(req: NextRequest) {
  const caller = await getFranchiseAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = createCatalogueItemSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { payload, ...itemFields } = body.data
  const supabase = adminClient()

  const { data: item, error: itemErr } = await supabase
    .from('network_catalog_items')
    .insert({ ...itemFields, org_id: caller.orgId })
    .select().single()

  if (itemErr || !item) return NextResponse.json({ error: itemErr?.message ?? 'Erreur' }, { status: 500 })

  await supabase.from('network_catalog_item_data').insert({ catalog_item_id: item.id, payload })

  return NextResponse.json({ item }, { status: 201 })
}
