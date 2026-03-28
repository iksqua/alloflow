import { createClient } from '@/lib/supabase/server'
import { PosShell } from './_components/pos-shell'
import { redirect } from 'next/navigation'
import type { CashSession } from './types'

export default async function PosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id, role').eq('id', user.id).single()

  if (!profile?.establishment_id) redirect('/login')
  const establishmentId = profile.establishment_id

  const [{ data: products }, { data: categories }, { data: session }, { data: tables }] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, emoji, price, tva_rate, category_id, is_active')
      .eq('establishment_id', establishmentId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order'),
    supabase
      .from('categories')
      .select('id, name, icon, color_hex, sort_order')
      .eq('establishment_id', establishmentId)
      .order('sort_order'),
    supabase
      .from('cash_sessions')
      .select('*')
      .eq('establishment_id', establishmentId)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('restaurant_tables')
      .select('id, name, seats, status, current_order_id')
      .eq('establishment_id', establishmentId)
      .order('name'),
  ])

  return (
    <PosShell
      initialProducts={(products ?? []) as Array<{
        id: string; name: string; emoji: string | null
        price: number; tva_rate: number; category_id: string | null; is_active: boolean
      }>}
      initialCategories={(categories ?? []) as Array<{ id: string; name: string; icon: string | null; color_hex: string }>}
      initialSession={(session ?? null) as CashSession | null}
      initialTables={(tables ?? []) as unknown as Array<{ id: string; name: string; status: string; current_order_id: string | null }>}
      cashierId={user.id}
      cashierName={user.email?.split('@')[0] ?? 'Caissier'}
      userRole={(profile?.role as string) ?? 'caissier'}
      establishmentId={establishmentId}
    />
  )
}
