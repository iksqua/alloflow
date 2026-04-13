import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { updateCatalogueItemSchema } from '@/lib/validations/catalogue'

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getFranchiseAdmin()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const { id } = await params
  const body = updateCatalogueItemSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const { payload, ...itemFields } = body.data
  const supabase = adminClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('network_catalog_items').select('id, org_id, version, is_mandatory, status').eq('id', id).single()
  if (!existing || existing.org_id !== caller.orgId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const wasMandatory = existing.is_mandatory
  const becomesMandatory = itemFields.is_mandatory ?? wasMandatory
  const isPublished = existing.status === 'published'

  // Update item fields
  const updateData: Record<string, unknown> = { ...itemFields, updated_at: new Date().toISOString() }
  if (payload !== undefined) updateData.version = existing.version + 1

  const { data: updated, error: updateErr } = await supabase
    .from('network_catalog_items').update(updateData).eq('id', id).select().single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Update payload (snapshot previous before overwriting)
  if (payload !== undefined) {
    const { data: existingData } = await supabase
      .from('network_catalog_item_data').select('payload').eq('catalog_item_id', id).single()

    await supabase.from('network_catalog_item_data').upsert({
      catalog_item_id:  id,
      payload,
      previous_payload: existingData?.payload ?? null,
    }, { onConflict: 'catalog_item_id' })

    // Notify franchisees if published
    if (isPublished) {
      await supabase.from('establishment_catalog_items')
        .update({ notified_at: new Date().toISOString() })
        .eq('catalog_item_id', id)
    }
  }

  // optional → mandatory: force is_active = true on all + notify
  if (isPublished && !wasMandatory && becomesMandatory) {
    await supabase.from('establishment_catalog_items')
      .update({ is_active: true, notified_at: new Date().toISOString() })
      .eq('catalog_item_id', id)
  }

  return NextResponse.json({ item: updated })
}
