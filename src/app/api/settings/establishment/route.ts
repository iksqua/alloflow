import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const TIMEZONES = ['Europe/Paris', 'Europe/Brussels', 'Europe/Luxembourg', 'Europe/Zurich', 'Africa/Casablanca', 'Africa/Tunis'] as const

const schema = z.object({
  name:     z.string().min(1).max(80),
  siret:    z.string().regex(/^\d{14}$/, '14 chiffres').optional().or(z.literal('')),
  address:  z.string().max(200).optional(),
  timezone: z.enum(TIMEZONES),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })
  if (profile.role === null || profile.role === undefined || !['admin', 'super_admin'].includes(profile.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('establishments')
    .select('name, siret, address, timezone')
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
  if (profile.role === null || profile.role === undefined || !['admin', 'super_admin'].includes(profile.role))
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 422 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('establishments')
    .update({
      name:     body.data.name,
      siret:    body.data.siret || null,
      address:  body.data.address || null,
      timezone: body.data.timezone,
    })
    .eq('id', profile.establishment_id)
    .select('name, siret, address, timezone')
    .single()

  if (error) return NextResponse.json({ error: 'Mise à jour échouée' }, { status: 500 })
  return NextResponse.json(data)
}
