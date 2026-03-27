// src/app/api/recipes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateRecipeSchema } from '@/lib/validations/recipe'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const result = updateRecipeSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { title, description, category, portion, is_internal, pos } = result.data

  // Build recipe update payload
  const recipeUpdate: Record<string, unknown> = {}
  if (title       !== undefined) recipeUpdate.title       = title
  if (description !== undefined) recipeUpdate.description = description
  if (category    !== undefined) recipeUpdate.category    = category
  if (portion     !== undefined) recipeUpdate.portion     = portion
  if (is_internal !== undefined) recipeUpdate.is_internal = is_internal

  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .update(recipeUpdate)
    .eq('id', id)
    .select('*, product:products!products_recipe_id_fkey(id)')
    .single()

  if (recipeError) return NextResponse.json({ error: recipeError.message }, { status: 500 })

  // Propagate name and price to linked product
  const linkedProductId = recipe.product?.[0]?.id ?? null

  if (linkedProductId) {
    const productUpdate: Record<string, unknown> = {}
    if (title) productUpdate.name = title
    if (pos?.price)       productUpdate.price       = pos.price
    if (pos?.tva_rate)    productUpdate.tva_rate    = pos.tva_rate
    if (pos?.category_id !== undefined) productUpdate.category_id = pos.category_id

    // If toggling to internal: soft-delete the product
    if (is_internal === true) {
      productUpdate.is_active = false
    }
    // If toggling back to POS: re-activate
    if (is_internal === false) {
      productUpdate.is_active = true
    }

    if (Object.keys(productUpdate).length > 0) {
      await supabase.from('products').update(productUpdate).eq('id', linkedProductId)
    }
  }

  // If switching from internal → POS and no product exists yet, create it
  if (is_internal === false && !linkedProductId && pos) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('establishment_id')
      .eq('id', user.id)
      .single()

    if (profile?.establishment_id) {
      await supabase.from('products').insert({
        establishment_id: profile.establishment_id,
        name:             recipe.title,
        price:            pos.price,
        tva_rate:         pos.tva_rate,
        category_id:      pos.category_id ?? null,
        recipe_id:        id,
        category:         'autre',
        is_active:        true,
      })
    }
  }

  return NextResponse.json(recipe)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Soft delete recipe
  const { error } = await supabase
    .from('recipes')
    .update({ active: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Soft delete linked product if any
  await supabase
    .from('products')
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('recipe_id', id)

  return NextResponse.json({ success: true })
}
