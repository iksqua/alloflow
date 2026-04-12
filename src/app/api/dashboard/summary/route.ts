import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolvePeriod, fetchDashboardData, type DashboardData } from '@/app/dashboard/_lib/fetch-dashboard-data'

export type DashboardSummary = DashboardData

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  const estId = profile?.establishment_id
  if (!estId) return NextResponse.json({ error: 'No establishment' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const bounds = resolvePeriod(
    searchParams.get('period'),
    searchParams.get('from'),
    searchParams.get('to'),
  )

  try {
    const summary = await fetchDashboardData(supabase, estId, bounds)
    return NextResponse.json(summary)
  } catch (e) {
    console.error('[dashboard/summary]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
