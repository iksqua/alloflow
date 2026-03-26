// src/app/api/receipts/z-report/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role === 'caissier') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { session_id } = await req.json()

  const { data: session } = await supabase
    .from('cash_sessions').select('*').eq('id', session_id).single()

  if (!session) return NextResponse.json({ error: 'session_not_found' }, { status: 404 })

  // Le rapport Z est généré côté client via window.print()
  // Cet endpoint confirme juste que l'impression peut commencer
  return NextResponse.json({ job_id: crypto.randomUUID(), session })
}
