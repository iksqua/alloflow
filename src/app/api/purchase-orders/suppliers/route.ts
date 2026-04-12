// src/app/api/purchase-orders/suppliers/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('establishment_id').eq('id', user.id).single()
  if (!profile?.establishment_id) return NextResponse.json({ suppliers: [] })

  const { data } = await supabase
    .from('purchase_orders')
    .select('supplier')
    .eq('establishment_id', profile.establishment_id)
    .order('supplier')

  const suppliers = [...new Set((data ?? []).map(r => r.supplier).filter(Boolean))]
  return NextResponse.json({ suppliers })
}
