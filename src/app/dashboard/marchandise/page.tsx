// src/app/dashboard/marchandise/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MarchandisePageClient } from './_components/marchandise-page-client'
import type { MarchandiseItem, RecipeRow, PosCategory } from './_components/types'

export default async function MarchandisePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()
  if (!profile?.establishment_id) redirect('/dashboard')

  const eid = profile.establishment_id

  const [stockRes, recipesRes, categoriesRes] = await Promise.all([
    supabase
      .from('stock_items')
      .select('*')
      .eq('establishment_id', eid)
      .eq('active', true)
      .order('name'),
    supabase
      .from('recipes')
      .select(`
        *,
        ingredients:recipe_ingredients(id, name, quantity, unit, unit_cost, sort_order),
        product:products!products_recipe_id_fkey(id, name, price, tva_rate, category_id, is_active),
        sop:sops(id, title, recipe_id, active, steps:sop_steps(id, sop_id, title, description, sort_order, duration_seconds, media_url))
      `)
      .eq('establishment_id', eid)
      .eq('active', true)
      .order('title'),
    supabase
      .from('categories')
      .select('id, name, color_hex, icon')
      .eq('establishment_id', eid)
      .order('sort_order'),
  ])

  const items: MarchandiseItem[] = (stockRes.data ?? []).map(i => ({
    id: i.id,
    establishment_id: i.establishment_id,
    name: i.name,
    category: i.category,
    unit: i.unit,
    purchase_price: (i as unknown as Record<string, number>).purchase_price ?? 0,
    purchase_qty: (i as unknown as Record<string, number>).purchase_qty ?? 1,
    supplier: i.supplier,
    supplier_ref: i.supplier_ref,
    is_pos: Boolean((i as Record<string, unknown>).is_pos),
    pos_price: (i as unknown as Record<string, number | null>).pos_price ?? null,
    pos_tva_rate: (i as unknown as Record<string, number>).pos_tva_rate ?? 10,
    pos_category_id: (i as unknown as Record<string, string | null>).pos_category_id ?? null,
    product_id: (i as unknown as Record<string, string | null>).product_id ?? null,
    active: i.active,
    network_status: ((i as unknown as Record<string, string>).network_status ?? 'not_shared') as MarchandiseItem['network_status'],
  }))

  const recipes: RecipeRow[] = (recipesRes.data ?? []).map(r => {
    const ings = r.ingredients ?? []
    const foodCostAmount = ings.reduce(
      (sum: number, i: { quantity: number; unit_cost: number }) => sum + i.quantity * i.unit_cost, 0
    )
    const product = r.product?.[0] ?? null
    const priceTTC = product ? product.price * (1 + product.tva_rate / 100) : 0
    const foodCostPct = priceTTC > 0
      ? Math.round((foodCostAmount / priceTTC) * 1000) / 10
      : null
    const sopRaw = r.sop?.[0] ?? null

    return {
      id: r.id,
      establishment_id: r.establishment_id,
      title: r.title,
      category: r.category,
      portion: r.portion,
      is_internal: r.is_internal,
      active: r.active,
      sop_required: Boolean((r as Record<string, unknown>).sop_required),
      network_status: ((r as unknown as Record<string, string>).network_status ?? 'not_shared') as RecipeRow['network_status'],
      ingredients: ings,
      product,
      sop: sopRaw ? { ...sopRaw, steps: sopRaw.steps ?? [] } : null,
      food_cost_amount: foodCostAmount,
      food_cost_pct: foodCostPct,
    }
  })

  const categories: PosCategory[] = (categoriesRes.data ?? [])

  const { tab } = await searchParams
  const initialTab = (['marchandise', 'recettes', 'en-vente', 'apercu-caisse'] as const)
    .includes(tab as 'marchandise') ? tab as string : 'marchandise'

  return (
    <MarchandisePageClient
      initialItems={items}
      initialRecipes={recipes}
      categories={categories}
      establishmentId={eid}
      initialTab={initialTab}
    />
  )
}
