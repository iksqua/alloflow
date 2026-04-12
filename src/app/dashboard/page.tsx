import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardPageClient } from './dashboard-page-client'
import type { DashboardSummary } from '@/app/api/dashboard/summary/route'

function getParisBoundaries(): { todayStart: Date; todayEnd: Date; yesterdayStart: Date } {
  const parisDateISO = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Paris',
  }).format(new Date())

  const utcStr = new Date().toISOString().slice(0, 19)
  const parisStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 19)
  const offsetHours = Math.round(
    (new Date(parisStr).getTime() - new Date(utcStr).getTime()) / 3600000
  )

  const [year, month, day] = parisDateISO.split('-').map(Number)
  const todayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetHours * 3600000)
  const todayEnd = new Date(todayStart.getTime() + 86400000)
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)

  return { todayStart, todayEnd, yesterdayStart }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('establishment_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.establishment_id) redirect('/login')
  const estId = profile.establishment_id

  const { data: establishment } = await supabase
    .from('establishments')
    .select('name')
    .eq('id', estId)
    .single()

  const { todayStart, todayEnd, yesterdayStart } = getParisBoundaries()

  const emptyState: DashboardSummary = {
    kpis: { caToday: 0, caYesterday: 0, ordersToday: 0, ordersYesterday: 0, avgTicketToday: 0, avgTicketYesterday: 0, loyalCustomersToday: 0 },
    hourlyActivity: Array.from({ length: 13 }, (_, i) => ({ hour: 8 + i, count: 0 })),
    stockAlerts: [],
    pendingDeliveries: [],
    topProducts: [],
    recentOrders: [],
  }

  try {
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
      supabase
        .from('orders')
        .select('id, total_ttc')
        .eq('establishment_id', estId)
        .eq('status', 'paid')
        .gte('created_at', todayStart.toISOString())
        .lt('created_at', todayEnd.toISOString()),

      supabase
        .from('orders')
        .select('id, total_ttc')
        .eq('establishment_id', estId)
        .eq('status', 'paid')
        .gte('created_at', yesterdayStart.toISOString())
        .lt('created_at', todayStart.toISOString()),

      supabase
        .from('orders')
        .select('created_at')
        .eq('establishment_id', estId)
        .eq('status', 'paid')
        .gte('created_at', todayStart.toISOString())
        .lt('created_at', todayEnd.toISOString()),

      supabase
        .from('stock_items')
        .select('id, name, quantity, alert_threshold')
        .eq('establishment_id', estId)
        .gt('alert_threshold', 0),

      supabase
        .from('purchase_orders')
        .select('id, supplier, created_at')
        .eq('establishment_id', estId)
        .eq('status', 'received'),

      supabase
        .from('order_items')
        .select('product_name, quantity, line_total, orders!inner(establishment_id, status, created_at)')
        .eq('orders.establishment_id', estId)
        .eq('orders.status', 'paid')
        .gte('orders.created_at', todayStart.toISOString())
        .lt('orders.created_at', todayEnd.toISOString()),

      supabase
        .from('orders')
        .select('id, total_ttc, created_at, customer_id, customers(first_name, last_name, tier), order_items(product_name, quantity)')
        .eq('establishment_id', estId)
        .eq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(8),

      supabase
        .from('loyalty_transactions')
        .select('customer_id, customers!inner(establishment_id)')
        .eq('customers.establishment_id', estId)
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
      const h = parseInt(
        new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })
          .format(new Date(o.created_at))
      )
      hourBuckets[h] = (hourBuckets[h] ?? 0) + 1
    }
    const hourlyActivity = Array.from({ length: 13 }, (_, i) => ({
      hour: 8 + i,
      count: hourBuckets[8 + i] ?? 0,
    }))

    // Stock alerts
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
    const pendingDeliveries = (deliveries ?? []).map((d: { id: string; supplier: string; created_at: string }) => ({
      id: d.id,
      supplierName: d.supplier,
      receivedAt: d.created_at,
    }))

    // Top products
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
        category: '',
        revenue: stats.revenue,
        quantity: stats.quantity,
      }))

    // Recent orders
    const recentOrders = (recentRaw ?? []).map((o: {
      id: string
      total_ttc: number
      created_at: string
      customers: { first_name: string; last_name: string | null; tier: string } | null
      order_items: { product_name: string; quantity: number }[]
    }) => {
      const items = o.order_items ?? []
      const itemsSummary = items
        .slice(0, 3)
        .map((i) => `${i.product_name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`)
        .join(', ') + (items.length > 3 ? '…' : '')

      const lastName = o.customers?.last_name
      return {
        id: o.id,
        orderNumber: null,
        customerName: o.customers ? `${o.customers.first_name}${lastName ? ` ${lastName.charAt(0)}.` : ''}` : null,
        customerTier: (o.customers?.tier ?? null) as 'standard' | 'silver' | 'gold' | null,
        totalAmount: o.total_ttc,
        itemsSummary,
        createdAt: o.created_at,
      }
    })

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

    return (
      <DashboardPageClient
        summary={summary}
        establishmentName={establishment?.name ?? 'Alloflow'}
      />
    )
  } catch {
    return (
      <DashboardPageClient
        summary={emptyState}
        establishmentName={establishment?.name ?? 'Alloflow'}
      />
    )
  }
}
