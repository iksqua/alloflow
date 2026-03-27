import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { RecettesPageClient } from './_components/recettes-page-client'
import type { Recipe } from './_components/types'

export default async function RecettesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/onboarding')

  const { data: recipes } = await supabase
    .from('recipes')
    .select(`
      *,
      ingredients:recipe_ingredients(id, name, quantity, unit, unit_cost, sort_order),
      product:products!products_recipe_id_fkey(id, name, price, tva_rate, category_id, is_active)
    `)
    .eq('establishment_id', profile.establishment_id)
    .eq('active', true)
    .order('created_at', { ascending: false })

  const enriched: Recipe[] = (recipes ?? []).map(r => {
    const foodCostAmount = (r.ingredients ?? []).reduce(
      (sum: number, i: { quantity: number; unit_cost: number }) => sum + i.quantity * i.unit_cost,
      0
    )
    const price = r.product?.[0]?.price ?? null
    const foodCostPct = price && price > 0
      ? Math.round((foodCostAmount / price) * 1000) / 10
      : null

    return { ...r, food_cost_amount: foodCostAmount, food_cost_pct: foodCostPct }
  })

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, color_hex, icon')
    .eq('establishment_id', profile.establishment_id)
    .order('sort_order')

  return <RecettesPageClient initialRecipes={enriched} categories={categories ?? []} />
}
