// src/app/api/tables/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { data } = await supabase
    .from('restaurant_tables')
    .select('*, room:rooms(*)')
    .eq('establishment_id', profile.establishment_id)
    .order('name')

  return NextResponse.json({ tables: data ?? [] })
}
