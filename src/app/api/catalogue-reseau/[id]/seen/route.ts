import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getAdminProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 401 as const }
  const { data: profile } = await supabase
    .from('profiles').select('role, establishment_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin' || !profile.establishment_id) return { error: 403 as const }
  return { userId: user.id, establishmentId: profile.establishment_id }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getAdminProfile()
  if ('error' in caller) return NextResponse.json({ error: caller.error === 401 ? 'Unauthorized' : 'Forbidden' }, { status: caller.error })

  const { id } = await params
  const supabase = await createClient()

  const { error } = await supabase
    .from('establishment_catalog_items')
    .update({ seen_at: new Date().toISOString() })
    .eq('id', id)
    .eq('establishment_id', caller.establishmentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
