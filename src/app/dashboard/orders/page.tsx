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

  const { data: orders } = await supabase
    .from('orders')
    .select(`
      id, total_ttc, status, created_at, customer_id, note,
      payments(method, amount),
      items:order_items(product_name, emoji, quantity, unit_price, tva_rate, line_total)
    `)
    .eq('establishment_id', profile.establishment_id)
    .in('status', ['paid', 'refunded', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(500)

  return (
    <OrdersPageClient
      initialOrders={(orders ?? []) as Parameters<typeof OrdersPageClient>[0]['initialOrders']}
      userRole={profile.role}
    />
  )
}
