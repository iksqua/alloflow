// src/app/api/dashboard/summary/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type DashboardSummary = {
  kpis: {
    caToday: number
    caYesterday: number
    ordersToday: number
    ordersYesterday: number
    avgTicketToday: number
    avgTicketYesterday: number
    loyalCustomersToday: number
  }
  hourlyActivity: { hour: number; count: number }[]
  stockAlerts: {
    id: string
    name: string
    quantity: number
    alertThreshold: number
    level: 'critical' | 'low'
  }[]
  pendingDeliveries: { id: string; supplierName: string; receivedAt: string }[]
  topProducts: {
    rank: number
    name: string
    category: string
    revenue: number
    quantity: number
  }[]
  recentOrders: {
    id: string
    orderNumber: number
    customerName: string | null
    customerTier: 'standard' | 'silver' | 'gold' | null
    totalAmount: number
    itemsSummary: string
    createdAt: string
  }[]
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('establishment_id').eq('id', user.id).single()
  const estId = profile?.establishment_id
  if (!estId) return NextResponse.json({ error: 'No establishment' }, { status: 400 })

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date()
  todayEnd.setHours(24, 0, 0, 0)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  const [
    { data: ordersToday },
    { data: ordersYesterday },
    { data: hourlyRaw },
    { data: stockItems },
    { data: deliveries },
    { data: topItems },
    { data: recentRaw },
    { data: loyaltyTx },
  ] = await Promise.all([
    // 1. Commandes aujourd'hui
    sb
      .from('orders')
      .select('id, total_ttc')
      .eq('establishment_id', estId)
      .eq('status', 'paid')
      .gte('created_at', todayStart.toISOString())
      .lt('created_at', todayEnd.toISOString()),

    // 2. Commandes hier
    sb
      .from('orders')
      .select('id, total_ttc')
      .eq('establishment_id', estId)
      .eq('status', 'paid')
      .gte('created_at', yesterdayStart.toISOString())
      .lt('created_at', todayStart.toISOString()),

    // 3. Activité horaire aujourd'hui
    sb
      .from('orders')
      .select('created_at')
      .eq('establishment_id', estId)
      .eq('status', 'paid')
      .gte('created_at', todayStart.toISOString())
      .lt('created_at', todayEnd.toISOString()),

    // 4. Alertes stock — filtre colonne-à-colonne impossible en Supabase JS
    //    on récupère tous avec alert_threshold > 0 et filtre côté JS
    sb
      .from('stock_items')
      .select('id, name, quantity, alert_threshold')
      .eq('establishment_id', estId)
      .gt('alert_threshold', 0),

    // 5. Livraisons reçues non validées
    sb
      .from('purchase_orders')
      .select('id, supplier_name, updated_at')
      .eq('establishment_id', estId)
      .eq('status', 'received'),

    // 6. Top produits aujourd'hui via order_items + inner join orders
    sb
      .from('order_items')
      .select('product_name, quantity, line_total, orders!inner(establishment_id, status, created_at)')
      .eq('orders.establishment_id', estId)
      .eq('orders.status', 'paid')
      .gte('orders.created_at', todayStart.toISOString())
      .lt('orders.created_at', todayEnd.toISOString()),

    // 7. Commandes récentes (payées uniquement, 8 dernières)
    sb
      .from('orders')
      .select('id, order_number, total_ttc, created_at, customer_id, customers(first_name, last_name, tier), order_items(product_name, quantity)')
      .eq('establishment_id', estId)
      .eq('status', 'paid')
      .order('created_at', { ascending: false })
      .limit(8),

    // 8. Clients fidèles aujourd'hui — COUNT DISTINCT sur loyalty_transactions
    sb
      .from('loyalty_transactions')
      .select('customer_id')
      .eq('establishment_id', estId)
      .gte('created_at', todayStart.toISOString())
      .lt('created_at', todayEnd.toISOString()),
  ])

  // KPIs
  const caToday = (ordersToday ?? []).reduce((s: number, o: { total_ttc: number }) => s + (o.total_ttc ?? 0), 0)
  const caYesterday = (ordersYesterday ?? []).reduce((s: number, o: { total_ttc: number }) => s + (o.total_ttc ?? 0), 0)
  const countToday = (ordersToday ?? []).length
  const countYesterday = (ordersYesterday ?? []).length

  // Hourly buckets (8h–20h)
  const hourBuckets: Record<number, number> = {}
  for (const o of hourlyRaw ?? []) {
    const h = new Date(o.created_at).getHours()
    hourBuckets[h] = (hourBuckets[h] ?? 0) + 1
  }
  const hourlyActivity = Array.from({ length: 13 }, (_, i) => ({
    hour: 8 + i,
    count: hourBuckets[8 + i] ?? 0,
  }))

  // Stock alerts — filtrer côté JS (quantity <= alert_threshold)
  const stockAlerts = ((stockItems ?? []) as { id: string; name: string; quantity: number; alert_threshold: number }[])
    .filter(s => s.quantity <= s.alert_threshold)
    .map(s => ({
      id: s.id,
      name: s.name,
      quantity: s.quantity,
      alertThreshold: s.alert_threshold,
      level: s.quantity <= s.alert_threshold * 0.4 ? 'critical' as const : 'low' as const,
    }))

  // Pending deliveries
  const pendingDeliveries = (deliveries ?? []).map((d: { id: string; supplier_name: string; updated_at: string }) => ({
    id: d.id,
    supplierName: d.supplier_name,
    receivedAt: d.updated_at,
  }))

  // Top products — agréger par product_name
  const productMap: Record<string, { revenue: number; quantity: number }> = {}
  for (const item of topItems ?? []) {
    const n = (item as { product_name: string }).product_name
    if (!productMap[n]) productMap[n] = { revenue: 0, quantity: 0 }
    productMap[n].revenue += (item as { line_total: number }).line_total ?? 0
    productMap[n].quantity += (item as { quantity: number }).quantity ?? 0
  }
  const topProducts = Object.entries(productMap)
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 5)
    .map(([name, stats], i) => ({
      rank: i + 1,
      name,
      category: '',   // order_items ne stocke pas la catégorie
      revenue: stats.revenue,
      quantity: stats.quantity,
    }))

  // Recent orders
  const recentOrders = (recentRaw ?? []).map((o: {
    id: string
    order_number: number
    total_ttc: number
    created_at: string
    customers: { first_name: string; last_name: string; tier: string } | null
    order_items: { product_name: string; quantity: number }[]
  }) => {
    const items = o.order_items ?? []
    const itemsSummary = items
      .slice(0, 3)
      .map((i) => `${i.product_name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`)
      .join(', ') + (items.length > 3 ? '…' : '')

    return {
      id: o.id,
      orderNumber: o.order_number,
      customerName: o.customers ? `${o.customers.first_name} ${o.customers.last_name.charAt(0)}.` : null,
      customerTier: (o.customers?.tier ?? null) as 'standard' | 'silver' | 'gold' | null,
      totalAmount: o.total_ttc,
      itemsSummary,
      createdAt: o.created_at,
    }
  })

  // Clients fidèles aujourd'hui — COUNT DISTINCT
  const loyalCustomersToday = new Set((loyaltyTx ?? []).map((t: { customer_id: string }) => t.customer_id)).size

  const summary: DashboardSummary = {
    kpis: {
      caToday,
      caYesterday,
      ordersToday: countToday,
      ordersYesterday: countYesterday,
      avgTicketToday: countToday > 0 ? caToday / countToday : 0,
      avgTicketYesterday: countYesterday > 0 ? caYesterday / countYesterday : 0,
      loyalCustomersToday,
    },
    hourlyActivity,
    stockAlerts,
    pendingDeliveries,
    topProducts,
    recentOrders,
  }

  return NextResponse.json(summary)
}
