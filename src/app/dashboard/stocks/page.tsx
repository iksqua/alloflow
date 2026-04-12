// src/app/dashboard/stocks/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { StocksPageClient } from './_components/stocks-page-client'
import type { StockItem } from './_components/types'

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

  const [stockRes, categoriesRes] = await Promise.all([
    supabase
      .from('stock_items')
      .select('*')
      .eq('establishment_id', profile.establishment_id)
      .eq('active', true)
      .order('name'),
    supabase
      .from('categories')
      .select('id, name, color_hex')
      .eq('establishment_id', profile.establishment_id)
      .order('sort_order'),
  ])

  const items: StockItem[] = (stockRes.data ?? []).map(i => ({
    ...i,
    status: i.quantity <= 0
      ? 'out_of_stock'
      : i.quantity < i.alert_threshold
      ? 'alert'
      : 'ok',
    purchase_price:  (i as unknown as Record<string, number>).purchase_price  ?? 0,
    purchase_qty:    (i as unknown as Record<string, number>).purchase_qty    ?? 0,
    is_pos:          Boolean((i as unknown as Record<string, unknown>).is_pos),
    pos_price:       (i as unknown as Record<string, number | null>).pos_price ?? null,
    pos_tva_rate:    (i as unknown as Record<string, number>).pos_tva_rate    ?? 10,
    pos_category_id: (i as unknown as Record<string, string | null>).pos_category_id ?? null,
    product_id:      (i as unknown as Record<string, string | null>).product_id      ?? null,
  }))

  return (
    <StocksPageClient
      initialItems={items}
      categories={(categoriesRes.data ?? []) as { id: string; name: string; color_hex: string }[]}
    />
  )
}
