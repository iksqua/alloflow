// src/app/dashboard/stocks/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StocksPageClient } from './_components/stocks-page-client'
import type { StockItem, PurchaseOrder } from './_components/types'

export default async function StocksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/onboarding')

  const [stockRes, ordersRes] = await Promise.all([
    supabase
      .from('stock_items')
      .select('*')
      .eq('establishment_id', profile.establishment_id)
      .eq('active', true)
      .order('name'),
    supabase
      .from('purchase_orders')
      .select('*, items:purchase_order_items(*, stock_item:stock_items(id, name, unit))')
      .eq('establishment_id', profile.establishment_id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const items: StockItem[] = (stockRes.data ?? []).map(i => ({
    ...i,
    status: i.quantity <= 0
      ? 'out_of_stock'
      : i.quantity < i.alert_threshold
      ? 'alert'
      : 'ok',
    // New columns added in migration 20260327000006 — fallback until Supabase types regenerated
    purchase_price: (i as unknown as Record<string, number>).purchase_price ?? 0,
    purchase_qty:   (i as unknown as Record<string, number>).purchase_qty   ?? 0,
  }))

  return (
    <StocksPageClient
      initialItems={items}
      initialOrders={(ordersRes.data ?? []) as PurchaseOrder[]}
    />
  )
}
