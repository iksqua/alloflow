// src/app/api/franchise/establishments/[id]/products/route.ts
// Allows franchise_admin to read/write products for any establishment in their network.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createProductSchema } from '@/lib/validations/product'

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

  const supabaseAdmin = createServiceClient()

  const allowed = ctx.role === 'super_admin' || await verifyEstablishmentInNetwork(supabaseAdmin, ctx.orgId, establishmentId)
  if (!allowed) return NextResponse.json({ error: 'Établissement hors réseau' }, { status: 403 })

  const { data: products, error } = await supabaseAdmin
    .from('products')
    .select('*, category:categories(id, name, color_hex, icon)')
    .eq('establishment_id', establishmentId)
    .is('deleted_at', null)
    .order('sort_order')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: categories } = await supabaseAdmin
    .from('categories')
    .select('*')
    .eq('establishment_id', establishmentId)
    .order('sort_order')

  return NextResponse.json({ products: products ?? [], categories: categories ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: establishmentId } = await params

  const ctx = await getFranchiseAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabaseAdmin = createServiceClient()

  const allowed = ctx.role === 'super_admin' || await verifyEstablishmentInNetwork(supabaseAdmin, ctx.orgId, establishmentId)
  if (!allowed) return NextResponse.json({ error: 'Établissement hors réseau' }, { status: 403 })

  const body = await req.json()
  const result = createProductSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({ ...result.data, establishment_id: establishmentId })
    .select('*, category:categories(id, name, color_hex, icon)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: establishmentId } = await params

  const ctx = await getFranchiseAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabaseAdmin = createServiceClient()

  const allowed = ctx.role === 'super_admin' || await verifyEstablishmentInNetwork(supabaseAdmin, ctx.orgId, establishmentId)
  if (!allowed) return NextResponse.json({ error: 'Établissement hors réseau' }, { status: 403 })

  const { productId, ...updates } = await req.json()
  if (!productId) return NextResponse.json({ error: 'productId requis' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('products')
    .update(updates)
    .eq('id', productId)
    .eq('establishment_id', establishmentId)
    .select('*, category:categories(id, name, color_hex, icon)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ product: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: establishmentId } = await params

  const ctx = await getFranchiseAdminContext()
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabaseAdmin = createServiceClient()

  const allowed = ctx.role === 'super_admin' || await verifyEstablishmentInNetwork(supabaseAdmin, ctx.orgId, establishmentId)
  if (!allowed) return NextResponse.json({ error: 'Établissement hors réseau' }, { status: 403 })

  const { productId } = await req.json()
  if (!productId) return NextResponse.json({ error: 'productId requis' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('products')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', productId)
    .eq('establishment_id', establishmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
