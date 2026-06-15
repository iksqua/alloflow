// src/app/api/fiscal-journal/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) return NextResponse.json({ error: 'Établissement non trouvé' }, { status: 400 })

  if (!['admin', 'super_admin', 'franchise_admin'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Insufficient permissions — admin required' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
  const offset = (page - 1) * limit

  const sortParam = searchParams.get('sort') ?? 'desc'
  const ascending = sortParam === 'asc'

  const { data, error, count } = await supabase
    .from('fiscal_journal_entries')
    .select('*, order:orders(id, status)', { count: 'exact' })
    .eq('establishment_id', profile.establishment_id)
    .order('sequence_no', { ascending })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    entries: data ?? [],
    total:   count ?? 0,
    page,
    limit,
  })
}
