// src/app/api/recipes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRecipeSchema } from '@/lib/validations/recipe'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', userId)
    .single()
  return data?.establishment_id ?? null
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select(`
      *,
      ingredients:recipe_ingredients(id, name, quantity, unit, unit_cost, sort_order),
      product:products!products_recipe_id_fkey(id, name, price, tva_rate, category_id, is_active)
    `)
    .eq('establishment_id', establishmentId)
    .eq('active', true)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute food_cost for each recipe
  const enriched = (recipes ?? []).map(r => {
    const foodCostAmount = (r.ingredients ?? []).reduce(
      (sum: number, i: { quantity: number; unit_cost: number }) => sum + i.quantity * i.unit_cost,
      0
    )
    const price = r.product?.price ?? null
    const foodCostPct = price && price > 0
      ? Math.round((foodCostAmount / price) * 1000) / 10  // one decimal
      : null

    return { ...r, food_cost_amount: foodCostAmount, food_cost_pct: foodCostPct }
  })

  return NextResponse.json({ recipes: enriched })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = createRecipeSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { title, description, category, portion, is_internal, ingredients, pos } = result.data

  // 1. Create recipe
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .insert({
      establishment_id: establishmentId,
      title,
      description:  description ?? null,
      category:     category ?? null,
      portion:      portion ?? null,
      is_internal,
    })
    .select()
    .single()

  if (recipeError) return NextResponse.json({ error: recipeError.message }, { status: 500 })

  // 2. Insert ingredients
  if (ingredients.length > 0) {
    await supabase.from('recipe_ingredients').insert(
      ingredients.map((ing, idx) => ({
        recipe_id:  recipe.id,
        name:       ing.name,
        quantity:   ing.quantity,
        unit:       ing.unit,
        unit_cost:  ing.unit_cost,
        sort_order: ing.sort_order ?? idx,
      }))
    )
  }

  // 3. If POS, create linked product (manual rollback on failure)
  if (!is_internal && pos) {
    const { error: productError } = await supabase
      .from('products')
      .insert({
        establishment_id: establishmentId,
        name:             title,
        price:            pos.price,
        tva_rate:         pos.tva_rate,
        category_id:      pos.category_id ?? null,
        recipe_id:        recipe.id,
        category:         'autre',  // legacy enum required — always 'autre' for recipe products
        is_active:        true,
      })

    if (productError) {
      // Rollback: soft-delete the recipe
      await supabase.from('recipes').update({ active: false }).eq('id', recipe.id)
      return NextResponse.json({ error: 'Erreur création produit POS: ' + productError.message }, { status: 500 })
    }
  }

  return NextResponse.json(recipe, { status: 201 })
}
