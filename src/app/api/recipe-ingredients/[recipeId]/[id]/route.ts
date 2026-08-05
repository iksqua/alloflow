// src/app/api/recipe-ingredients/[recipeId]/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateIngredientSchema } from '@/lib/validations/recipe'

async function verifyRecipeOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  recipeId: string,
  establishmentId: string,
) {
  const { data } = await supabase
    .from('recipes')
    .select('id')
    .eq('id', recipeId)
    .eq('establishment_id', establishmentId)
    .single()
  return !!data
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ recipeId: string; id: string }> }) {
  const { recipeId, id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  if (!await verifyRecipeOwnership(supabase, recipeId, profile.establishment_id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const result = updateIngredientSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('recipe_ingredients')
    .update(result.data)
    .eq('id', id)
    .eq('recipe_id', recipeId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ recipeId: string; id: string }> }) {
  const { recipeId, id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  if (!await verifyRecipeOwnership(supabase, recipeId, profile.establishment_id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await supabase
    .from('recipe_ingredients')
    .delete()
    .eq('id', id)
    .eq('recipe_id', recipeId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
