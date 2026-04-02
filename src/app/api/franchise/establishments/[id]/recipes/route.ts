// src/app/api/franchise/establishments/[id]/recipes/route.ts
// Allows franchise_admin to read recipes for any establishment in their network.
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
async function verifyEstablishmentInNetwork(supabaseAdmin: any,
  orgId: string,
  establishmentId: string
): Promise<boolean> {
  const { data: networkOrgs } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .or(`id.eq.${orgId},parent_org_id.eq.${orgId}`)

  if (!networkOrgs || networkOrgs.length === 0) return false
  const orgIds = networkOrgs.map((o: { id: string }) => o.id)

  const { data: est } = await supabaseAdmin
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

  const [recipesRes, categoriesRes] = await Promise.all([
    supabaseAdmin
      .from('recipes')
      .select(`
        *,
        ingredients:recipe_ingredients(id, name, quantity, unit, unit_cost, sort_order),
        product:products!products_recipe_id_fkey(id, name, price, tva_rate, category_id, is_active)
      `)
      .eq('establishment_id', establishmentId)
      .eq('active', true)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('categories')
      .select('id, name, color_hex, icon')
      .eq('establishment_id', establishmentId)
      .order('sort_order'),
  ])

  if (recipesRes.error) return NextResponse.json({ error: recipesRes.error.message }, { status: 500 })

  const enriched = (recipesRes.data ?? []).map(r => {
    const foodCostAmount = ((r.ingredients ?? []) as Array<{ quantity: number; unit_cost: number }>).reduce(
      (sum, i) => sum + i.quantity * i.unit_cost,
      0
    )
    const price = (r.product as Array<{ price: number }> | null)?.[0]?.price ?? null
    const foodCostPct = price && price > 0
      ? Math.round((foodCostAmount / price) * 1000) / 10
      : null

    return { ...r, food_cost_amount: foodCostAmount, food_cost_pct: foodCostPct }
  })

  return NextResponse.json({
    recipes:    enriched,
    categories: categoriesRes.data ?? [],
  })
}
