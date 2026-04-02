import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { uuidStr } from '@/lib/validations/uuid'

const bulkSchema = z.object({
  action: z.enum(['activate', 'deactivate', 'delete', 'change_category', 'change_tva']),
  ids: z.array(z.string().min(1)).min(1),
  category_id: uuidStr.optional(),
  tva_rate: z.union([z.literal(5.5), z.literal(10), z.literal(20)]).optional(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 403 })

  const { action, ids, category_id, tva_rate } = parsed.data

  let update: Record<string, unknown> = {}
  if (action === 'activate') update = { is_active: true }
  else if (action === 'deactivate') update = { is_active: false }
  else if (action === 'delete') update = { deleted_at: new Date().toISOString() }
  else if (action === 'change_category' && category_id) update = { category_id }
  else if (action === 'change_tva' && tva_rate) update = { tva_rate }
  else return NextResponse.json({ error: 'Missing required field for action' }, { status: 400 })

  // Filter by establishment_id to prevent cross-tenant modification
  const { error } = await supabase
    .from('products')
    .update(update)
    .in('id', ids)
    .eq('establishment_id', profile.establishment_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, count: ids.length })
}
