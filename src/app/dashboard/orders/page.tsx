import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OrdersPageClient } from './_components/orders-page-client'

export default async function OrdersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/onboarding')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: orders } = await (supabase as unknown as any)
    .from('orders')
    .select('id, order_number, total_ttc, status, created_at, customer_id, note')
    .eq('establishment_id', profile.establishment_id)
    .in('status', ['paid', 'refunded', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <OrdersPageClient
      initialOrders={(orders ?? []) as {
        id: string
        order_number: number | null
        total_ttc: number
        status: string
        created_at: string
        customer_id: string | null
        note: string | null
      }[]}
      userRole={profile.role}
    />
  )
}
