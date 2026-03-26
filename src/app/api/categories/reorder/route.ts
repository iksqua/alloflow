import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { reorderCategoriesSchema } from '@/lib/validations/category'

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = reorderCategoriesSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const updates = parsed.data.order.map((id, index) =>
    supabase.from('categories').update({ sort_order: index }).eq('id', id)
  )
  await Promise.all(updates)

  const { data } = await supabase.from('categories').select().order('sort_order')
  return NextResponse.json({ categories: data })
}
