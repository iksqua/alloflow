// src/app/dashboard/stocks/commandes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PurchaseOrdersPageClient } from './_components/purchase-orders-page-client'
import type { PurchaseOrder } from './_components/types'
import type { StockItem } from '../_components/types'

export default async function CommandesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/dashboard')
  const estId = profile.establishment_id

  const [ordersRes, stockRes, categoriesRes] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select(`
        *,
        items:purchase_order_items(*, stock_item:stock_items(id, name, unit)),
        receptions:purchase_order_receptions(id, received_at, notes, lines)
      `)
      .eq('establishment_id', estId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('stock_items')
      .select('*')
      .eq('establishment_id', estId)
      .eq('active', true)
      .order('name'),
    supabase
      .from('categories')
      .select('id, name, color_hex')
      .eq('establishment_id', estId)
      .order('sort_order'),
  ])

  const stockItems: StockItem[] = (stockRes.data ?? []).map(i => ({
    ...i,
    status: i.quantity <= 0 ? 'out_of_stock' : i.quantity < i.alert_threshold ? 'alert' : 'ok',
    purchase_price:  (i as unknown as Record<string, number>).purchase_price  ?? 0,
    purchase_qty:    (i as unknown as Record<string, number>).purchase_qty    ?? 0,
    is_pos:          Boolean((i as unknown as Record<string, unknown>).is_pos),
    pos_price:       (i as unknown as Record<string, number | null>).pos_price ?? null,
    pos_tva_rate:    (i as unknown as Record<string, number>).pos_tva_rate    ?? 10,
    pos_category_id: (i as unknown as Record<string, string | null>).pos_category_id ?? null,
    product_id:      (i as unknown as Record<string, string | null>).product_id      ?? null,
  }))

  return (
    <PurchaseOrdersPageClient
      initialOrders={(ordersRes.data ?? []) as unknown as PurchaseOrder[]}
      stockItems={stockItems}
      categories={(categoriesRes.data ?? []) as { id: string; name: string; color_hex: string }[]}
      totalCount={ordersRes.data?.length ?? 0}
    />
  )
}
