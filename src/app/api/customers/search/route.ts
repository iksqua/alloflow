// src/app/api/customers/search/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getEstablishmentId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('establishment_id').eq('id', userId).single()
  return data?.establishment_id ?? null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const establishmentId = await getEstablishmentId(supabase, user.id)
  if (!establishmentId) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  const q = new URL(req.url).searchParams.get('q') ?? ''
  if (q.length < 3) return NextResponse.json({ customers: [] })

  // Search by email if query contains @, otherwise search phone AND name
  const isEmail = q.includes('@')

  let query = supabase
    .from('customers')
    .select('id, first_name, last_name, phone, email, points, tier')
    .eq('establishment_id', establishmentId)
    .limit(5)

  if (isEmail) {
    query = query.ilike('email', `%${q}%`)
  } else {
    // Search by phone OR first_name OR last_name
    query = query.or(
      `phone.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`
    )
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ customers: data ?? [] })
}
