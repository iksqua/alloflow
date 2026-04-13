import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateEstablishmentCatalogItemSchema } from '@/lib/validations/catalogue'

async function getAdminProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 401 as const }
  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin' || !profile.establishment_id) return { error: 403 as const }
  return { userId: user.id, establishmentId: profile.establishment_id }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getAdminProfile()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const { id } = await params
  const body = updateEstablishmentCatalogItemSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  const supabase = await createClient()

  const { data: eci } = await supabase
    .from('establishment_catalog_items')
    .select('id, catalog_item_id, network_catalog_items(is_mandatory)')
    .eq('id', id)
    .eq('establishment_id', caller.establishmentId)
    .single()

  if (!eci) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const catalogItem = eci.network_catalog_items as { is_mandatory: boolean } | null
  if (body.data.is_active === false && catalogItem?.is_mandatory) {
    return NextResponse.json({ error: 'Impossible de désactiver un item obligatoire' }, { status: 400 })
  }

  const { data: updated, error } = await supabase
    .from('establishment_catalog_items')
    .update(body.data)
    .eq('id', id)
    .eq('establishment_id', caller.establishmentId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: updated })
}
