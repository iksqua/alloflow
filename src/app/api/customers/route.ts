// src/app/api/customers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createCustomerSchema } from '@/lib/validations/loyalty'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('establishment_id').eq('id', userId).single()
  return data?.establishment_id ?? null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const body = await req.json()
  const result = createCustomerSchema.safeParse(body)
  if (!result.success) return NextResponse.json({ error: result.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('customers')
    .insert({
      establishment_id: establishmentId,
      created_by:       user.id,
      name:             result.data.first_name,   // legacy `name` field (NOT NULL)
      first_name:       result.data.first_name,
      last_name:        result.data.last_name ?? null,
      phone:            result.data.phone ?? null,
      email:            result.data.email ?? null,
      points:           0,
      tier:             'standard',
    })
    .select('id, first_name, last_name, phone, email, points, tier')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
