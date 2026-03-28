import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  default_opening_float: z.number().min(0).max(9999),
  auto_print_receipt:    z.boolean(),
  receipt_footer:        z.string().max(160),
  default_tva_rate:      z.union([z.literal(5.5), z.literal(10), z.literal(20)]),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (!['admin', 'super_admin'].includes(profile.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('establishments')
    .select('default_opening_float, auto_print_receipt, receipt_footer, default_tva_rate')
    .eq('id', profile.establishment_id)
    .single()

  return NextResponse.json(data ?? {})
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (!['admin', 'super_admin'].includes(profile.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('establishments')
    .update(body.data)
    .eq('id', profile.establishment_id)
    .select('default_opening_float, auto_print_receipt, receipt_footer, default_tva_rate')
    .single()

  if (error) return NextResponse.json({ error: 'Mise à jour échouée' }, { status: 500 })
  return NextResponse.json(data)
}
