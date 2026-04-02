// src/app/api/franchise/establishments/[id]/stocks/route.ts
// Allows franchise_admin to read stock items for any establishment in their network.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

async function getFranchiseAdminContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['franchise_admin', 'super_admin'].includes(profile.role) || !profile.org_id) return null
  return { userId: user.id, orgId: profile.org_id, role: profile.role }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function verifyEstablishmentInNetwork(admin: any, orgId: string, establishmentId: string): Promise<boolean> {
  const { data: networkOrgs } = await admin
    .from('organizations')
    .select('id')
    .or(`id.eq.${orgId},parent_org_id.eq.${orgId}`)

  if (!networkOrgs || networkOrgs.length === 0) return false
  const orgIds = networkOrgs.map((o: { id: string }) => o.id)

  const { data: est } = await admin
    .from('establishments')
    .select('id')
    .eq('id', establishmentId)
    .in('org_id', orgIds)
    .single()

  return !!est
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: establishmentId } = await params

  const ctx = await getFranchiseAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createServiceClient()

  const allowed = ctx.role === 'super_admin' || await verifyEstablishmentInNetwork(admin, ctx.orgId, establishmentId)
  if (!allowed) return NextResponse.json({ error: 'Établissement hors réseau' }, { status: 403 })

  const [stockRes, ordersRes, categoriesRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (admin.from('stock_items') as any)
      .select('*')
      .eq('establishment_id', establishmentId)
      .eq('active', true)
      .order('name'),
    admin
      .from('purchase_orders')
      .select('*, items:purchase_order_items(*, stock_item:stock_items(id, name, unit))')
      .eq('establishment_id', establishmentId)
      .order('created_at', { ascending: false })
      .limit(20),
    admin
      .from('categories')
      .select('id, name, color_hex')
      .eq('establishment_id', establishmentId)
      .order('sort_order'),
  ])

  if (stockRes.error) return NextResponse.json({ error: stockRes.error.message }, { status: 500 })

  // Compute status
  const items = (stockRes.data ?? []).map((i: Record<string, unknown>) => ({
    ...i,
    status: (i.quantity as number) <= 0
      ? 'out_of_stock'
      : (i.quantity as number) < (i.alert_threshold as number)
      ? 'alert'
      : 'ok',
    purchase_price:  (i.purchase_price  as number)  ?? 0,
    purchase_qty:    (i.purchase_qty    as number)   ?? 0,
    is_pos:          Boolean(i.is_pos),
    pos_price:       (i.pos_price       as number | null) ?? null,
    pos_tva_rate:    (i.pos_tva_rate    as number)   ?? 10,
    pos_category_id: (i.pos_category_id as string | null) ?? null,
    product_id:      (i.product_id      as string | null) ?? null,
  }))

  return NextResponse.json({
    items,
    orders:     ordersRes.data     ?? [],
    categories: categoriesRes.data ?? [],
  })
}
