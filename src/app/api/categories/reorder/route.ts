import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reorderCategoriesSchema } from '@/lib/validations/category'

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  const establishmentId = profile.establishment_id

  const body = await req.json()
  const parsed = reorderCategoriesSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Verify all provided IDs belong to this establishment before writing
  const { data: ownedCategories } = await supabase
    .from('categories')
    .select('id')
    .in('id', parsed.data.order)
    .eq('establishment_id', establishmentId)

  const ownedIds = new Set((ownedCategories ?? []).map((c) => c.id))
  if (ownedIds.size !== parsed.data.order.length) {
    return NextResponse.json({ error: 'Forbidden — one or more category IDs do not belong to your establishment' }, { status: 403 })
  }

  const updates = parsed.data.order.map((id, index) =>
    supabase.from('categories').update({ sort_order: index }).eq('id', id).eq('establishment_id', establishmentId)
  )
  await Promise.all(updates)

  const { data } = await supabase.from('categories').select().eq('establishment_id', establishmentId).order('sort_order')
  return NextResponse.json({ categories: data })
}
