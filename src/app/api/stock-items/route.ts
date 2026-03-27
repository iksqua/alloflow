// src/app/api/stock-items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createStockItemSchema } from '@/lib/validations/stock'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', userId)
    .single()
  return data?.establishment_id ?? null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const status  = searchParams.get('status')  // 'alert' | 'out_of_stock' | 'ok'
  const search  = searchParams.get('search')
  const category = searchParams.get('category')

  let query = supabase
    .from('stock_items')
    .select('*')
    .eq('establishment_id', establishmentId)
    .eq('active', true)
    .order('name')

  if (search)   query = query.ilike('name', `%${search}%`)
  if (category) query = query.eq('category', category)
  if (status === 'out_of_stock') query = query.lte('quantity', 0)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute status client-side (avoids raw SQL in filter)
  const items = (data ?? []).map(item => ({
    ...item,
    status: item.quantity <= 0
      ? 'out_of_stock'
      : item.quantity < item.alert_threshold
      ? 'alert'
      : 'ok',
  }))

  const filtered = status && status !== 'all'
    ? items.filter(i => i.status === status)
    : items

  return NextResponse.json({ items: filtered })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = createStockItemSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('stock_items')
    .insert({ ...result.data, establishment_id: establishmentId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
