import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { PilotageDetailClient } from './_components/pilotage-detail-client'
import type { Product, Category } from '@/app/dashboard/products/_components/types'
import type { Recipe } from '@/app/dashboard/recettes/_components/types'
import type { MarchandiseItem, RecipeRow } from '@/app/dashboard/marchandise/_components/types'

export default async function PilotageDetailPage({
  params,
}: {
  params: Promise<{ establishmentId: string }>
}) {
  const { establishmentId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['franchise_admin', 'super_admin'].includes(profile.role)) redirect('/dashboard')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const cookieHeader = (await import('next/headers')).cookies()
  const cookieStr = (await cookieHeader).toString()

  const base = `${baseUrl}/api/franchise/establishments/${establishmentId}`
  const headers = { Cookie: cookieStr }
  const opts = { headers, cache: 'no-store' as const }

  // Fetch name/type from establishment list to show the header
  let establishmentName = 'Établissement'

  const [productsRes, stocksRes, recipesRes, estListRes] = await Promise.all([
    fetch(`${base}/products`, opts).then(r => r.ok ? r.json() : null),
    fetch(`${base}/stocks`,   opts).then(r => r.ok ? r.json() : null),
    fetch(`${base}/recipes`,  opts).then(r => r.ok ? r.json() : null),
    fetch(`${baseUrl}/api/franchise/establishments`, opts).then(r => r.ok ? r.json() : null),
  ])

  // 403 / not found: establishment not in this network
  if (!productsRes && !stocksRes && !recipesRes) notFound()

  if (estListRes?.establishments) {
    const found = estListRes.establishments.find((e: { id: string; name: string }) => e.id === establishmentId)
    if (found) establishmentName = found.name
  }

  const initialProducts:   Product[]  = productsRes?.products   ?? []
  const initialCategories: Category[] = productsRes?.categories ?? []
  const initialRecipes:    Recipe[]   = recipesRes?.recipes     ?? []

  // Map raw stock_items to MarchandiseItem[]
  const rawItems: Record<string, unknown>[] = stocksRes?.items ?? []
  const initialPosItems: MarchandiseItem[] = rawItems.map(i => ({
    id: i.id as string,
    establishment_id: i.establishment_id as string,
    name: i.name as string,
    category: (i.category as string | null) ?? null,
    unit: i.unit as string,
    purchase_price: (i.purchase_price as number) ?? 0,
    purchase_qty: (i.purchase_qty as number) ?? 1,
    supplier: (i.supplier as string | null) ?? null,
    supplier_ref: (i.supplier_ref as string | null) ?? null,
    is_pos: Boolean(i.is_pos),
    pos_price: (i.pos_price as number | null) ?? null,
    pos_tva_rate: (i.pos_tva_rate as number) ?? 10,
    pos_category_id: (i.pos_category_id as string | null) ?? null,
    product_id: (i.product_id as string | null) ?? null,
    active: Boolean(i.active),
    network_status: ((i.network_status as string) ?? 'not_shared') as MarchandiseItem['network_status'],
  }))

  // Map raw recipes to RecipeRow[]
  const rawRecipes: Record<string, unknown>[] = recipesRes?.recipes ?? []
  const initialPosRecipes: RecipeRow[] = rawRecipes.map(r => {
    const ings = (r.ingredients as { id: string; name: string; quantity: number; unit: string; unit_cost: number; sort_order: number }[]) ?? []
    const foodCostAmount = ings.reduce(
      (sum: number, i) => sum + i.quantity * i.unit_cost, 0
    )
    const productArr = r.product as { id: string; name: string; price: number; tva_rate: number; category_id: string | null; is_active: boolean }[] | null
    const product = productArr?.[0] ?? null
    const foodCostPct = product?.price && product.price > 0
      ? Math.round((foodCostAmount / product.price) * 1000) / 10
      : null
    const sopArr = r.sop as { id: string; title: string; recipe_id: string | null; active: boolean; steps: unknown[] }[] | null
    const sopRaw = sopArr?.[0] ?? null

    return {
      id: r.id as string,
      establishment_id: r.establishment_id as string,
      title: r.title as string,
      category: (r.category as string | null) ?? null,
      portion: (r.portion as string | null) ?? null,
      is_internal: Boolean(r.is_internal),
      active: Boolean(r.active),
      sop_required: Boolean((r as Record<string, unknown>).sop_required),
      network_status: ((r.network_status as string) ?? 'not_shared') as RecipeRow['network_status'],
      ingredients: ings,
      product,
      sop: sopRaw ? { ...sopRaw, steps: (sopRaw.steps as RecipeRow['sop'] extends { steps: infer S } ? S : never) ?? [] } : null,
      food_cost_amount: foodCostAmount,
      food_cost_pct: foodCostPct,
    }
  })

  return (
    <PilotageDetailClient
      establishmentId={establishmentId}
      establishmentName={establishmentName}
      initialProducts={initialProducts}
      initialCategories={initialCategories}
      initialRecipes={initialRecipes}
      initialPosItems={initialPosItems}
      initialPosRecipes={initialPosRecipes}
    />
  )
}
