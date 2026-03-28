// src/app/api/stock-items/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateStockItemSchema } from '@/lib/validations/stock'

async function getProfile(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', userId)
    .single()
  return data
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getProfile(supabase, user.id)
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = updateStockItemSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { is_pos, pos_price, pos_tva_rate, pos_category_id, ...stockFields } = result.data

  // Fetch current state to know if product_id already exists
  const { data: current } = await supabase
    .from('stock_items')
    .select('product_id, name, is_pos')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!current) return NextResponse.json({ error: 'Article non trouvé' }, { status: 404 })

  // Update stock item — cast via any because Supabase types predate the new columns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stockItem, error } = await (supabase.from('stock_items') as any)
    .update({ ...stockFields, is_pos, pos_price, pos_tva_rate: is_pos ? pos_tva_rate : 10, pos_category_id })
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const existingProductId = (current as unknown as { product_id: string | null }).product_id
  let finalProductId: string | null = existingProductId

  if (is_pos && pos_price) {
    const tva     = pos_tva_rate ?? 10
    const priceHt = parseFloat((pos_price / (1 + tva / 100)).toFixed(4))

    if (existingProductId) {
      // Update linked product
      await supabase.from('products').update({
        name:        stockFields.name ?? stockItem.name,
        price:       priceHt,
        tva_rate:    tva,
        category_id: pos_category_id ?? null,
        is_active:   true,
      }).eq('id', existingProductId)
    } else {
      // Create new linked product
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          establishment_id: profile.establishment_id,
          name:             stockItem.name,
          price:            priceHt,
          tva_rate:         tva,
          category_id:      pos_category_id ?? null,
          is_active:        true,
        })
        .select('id')
        .single()

      if (productError) return NextResponse.json({ error: 'Erreur création produit caisse : ' + productError.message }, { status: 500 })

      if (product) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('stock_items') as any).update({ product_id: product.id }).eq('id', id)
        finalProductId = product.id
      }
    }
  } else if (!is_pos && existingProductId) {
    // Toggled OFF — deactivate linked product
    await supabase.from('products').update({ is_active: false }).eq('id', existingProductId)
    finalProductId = null
  }

  return NextResponse.json({ ...stockItem, product_id: finalProductId })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch profile to verify ownership (fixes IDOR)
  const profile = await getProfile(supabase, user.id)
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  // Fetch item with establishment_id filter to prevent IDOR
  const { data: item } = await supabase
    .from('stock_items')
    .select('product_id')
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)
    .single()

  if (!item) return NextResponse.json({ error: 'Article non trouvé' }, { status: 404 })

  // Deactivate linked POS product if any
  if ((item as unknown as { product_id: string | null }).product_id) {
    await supabase.from('products')
      .update({ is_active: false })
      .eq('id', (item as unknown as { product_id: string }).product_id)
  }

  const { error } = await supabase
    .from('stock_items')
    .update({ active: false })
    .eq('id', id)
    .eq('establishment_id', profile.establishment_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
