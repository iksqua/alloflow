import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCategorySchema } from '@/lib/validations/category'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const { data, error } = await supabase
    .from('categories')
    .select('*, products(count)')
    .eq('establishment_id', profile.establishment_id)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Supabase retourne products: [{count: N}] — on normalise en products_count: N
  const categories = (data ?? []).map((cat) => ({
    ...cat,
    products_count: (cat.products as Array<{ count: number }>)?.[0]?.count ?? 0,
    products: undefined,
  }))

  return NextResponse.json({ categories })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const body = await req.json()
  const parsed = createCategorySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('categories')
    .insert({ ...parsed.data, establishment_id: profile.establishment_id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data }, { status: 201 })
}
