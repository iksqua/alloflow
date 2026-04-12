import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Period helpers ──────────────────────────────────────────────────────────

function getParisOffsetMs(): number {
  const utcStr  = new Date().toISOString().slice(0, 19)
  const parisStr = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).slice(0, 19)
  return Math.round((new Date(parisStr).getTime() - new Date(utcStr).getTime()) / 3600000) * 3600000
}

function parisMidnightUTC(isoDate: string): Date {
  const offsetMs = getParisOffsetMs()
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - offsetMs)
}

function todayISO(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date())
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000)
}

export interface PeriodBounds {
  from: Date
  to: Date          // exclusive upper bound
  prevFrom: Date
  prevTo: Date
  label: string
  isToday: boolean
}

export function resolvePeriod(
  period?: string | null,
  fromParam?: string | null,
  toParam?: string | null,
): PeriodBounds {
  const today = todayISO()
  const todayStart = parisMidnightUTC(today)

  if (fromParam && toParam) {
    const from = parisMidnightUTC(fromParam)
    const to   = addDays(parisMidnightUTC(toParam), 1)
    const days = Math.round((to.getTime() - from.getTime()) / 86400000)
    return {
      from, to,
      prevFrom: addDays(from, -days),
      prevTo: from,
      label: `${fromParam} → ${toParam}`,
      isToday: fromParam === today && days === 1,
    }
  }

  if (period === '7d') {
    const to   = addDays(todayStart, 1)
    const from = addDays(todayStart, -6)
    return { from, to, prevFrom: addDays(from, -7), prevTo: from, label: '7 derniers jours', isToday: false }
  }

  if (period === '30d') {
    const to   = addDays(todayStart, 1)
    const from = addDays(todayStart, -29)
    return { from, to, prevFrom: addDays(from, -30), prevTo: from, label: '30 derniers jours', isToday: false }
  }

  // Default: today
  return {
    from: todayStart,
    to: addDays(todayStart, 1),
    prevFrom: addDays(todayStart, -1),
    prevTo: todayStart,
    label: "Aujourd'hui",
    isToday: true,
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DashboardData {
  period: { from: string; to: string; label: string; isToday: boolean }
  kpis: {
    ca: number
    caPrev: number
    orders: number
    ordersPrev: number
    avgTicket: number
    avgTicketPrev: number
    loyalCustomers: number
    newCustomers: number
    refundCount: number
    avgItemsPerOrder: number
  }
  cashSession: {
    status: 'open' | 'closed'
    openedAt: string | null
    totalSales: number | null
    openingFloat: number
  } | null
  paymentBreakdown: { method: string; amount: number; count: number }[]
  hourlyActivity: { hour: number; count: number }[]
  dailyTrend: { date: string; ca: number; orders: number }[]
  stockAlerts: { id: string; name: string; quantity: number; alertThreshold: number; level: 'critical' | 'low' }[]
  pendingDeliveries: { id: string; supplierName: string; receivedAt: string }[]
  topProducts: { rank: number; name: string; revenue: number; quantity: number }[]
  recentOrders: {
    id: string
    orderNumber: number | null
    customerName: string | null
    customerTier: 'standard' | 'silver' | 'gold' | null
    totalAmount: number
    itemsSummary: string
    createdAt: string
  }[]
}

// ─── Main fetch ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchDashboardData(supabase: SupabaseClient<any>, estId: string, bounds: PeriodBounds): Promise<DashboardData> {
  const { from, to, prevFrom, prevTo, isToday } = bounds
  const fromISO    = from.toISOString()
  const toISO      = to.toISOString()
  const prevFromISO = prevFrom.toISOString()
  const prevToISO   = prevTo.toISOString()
  const todayStart  = parisMidnightUTC(todayISO())

  const [
    { data: ordersCur },
    { data: ordersPrev },
    { data: orderItems },
    { data: prevItems },
    { data: stockItems },
    { data: deliveries },
    { data: recentRaw },
    { data: loyaltyTx },
    { data: newCustomers },
    { data: refunds },
    { data: payments },
    { data: cashSession },
  ] = await Promise.all([
    // 1. Orders current period (paid)
    supabase.from('orders').select('id, total_ttc')
      .eq('establishment_id', estId).eq('status', 'paid')
      .gte('created_at', fromISO).lt('created_at', toISO),

    // 2. Orders prev period (paid)
    supabase.from('orders').select('id, total_ttc')
      .eq('establishment_id', estId).eq('status', 'paid')
      .gte('created_at', prevFromISO).lt('created_at', prevToISO),

    // 3. Order items for current period (top products + avg items)
    supabase.from('order_items')
      .select('product_name, quantity, line_total, orders!inner(establishment_id, status, created_at)')
      .eq('orders.establishment_id', estId).eq('orders.status', 'paid')
      .gte('orders.created_at', fromISO).lt('orders.created_at', toISO),

    // 4. Orders with created_at for hourly/daily chart
    supabase.from('orders').select('created_at, total_ttc')
      .eq('establishment_id', estId).eq('status', 'paid')
      .gte('created_at', fromISO).lt('created_at', toISO)
      .order('created_at', { ascending: true }),

    // 5. Stock alerts
    supabase.from('stock_items').select('id, name, quantity, alert_threshold')
      .eq('establishment_id', estId).gt('alert_threshold', 0),

    // 6. Pending deliveries (purchase_orders received)
    supabase.from('purchase_orders').select('id, supplier, created_at')
      .eq('establishment_id', estId).eq('status', 'received'),

    // 7. Recent 8 paid orders
    supabase.from('orders')
      .select('id, total_ttc, created_at, customers(first_name, last_name, tier), order_items(product_name, quantity)')
      .eq('establishment_id', estId).eq('status', 'paid')
      .order('created_at', { ascending: false }).limit(8),

    // 8. Loyal customers (unique customers with loyalty tx in period)
    supabase.from('loyalty_transactions')
      .select('customer_id, customers!inner(establishment_id)')
      .eq('customers.establishment_id', estId)
      .gte('created_at', fromISO).lt('created_at', toISO),

    // 9. New customers in period
    supabase.from('customers').select('id', { count: 'exact', head: true })
      .eq('establishment_id', estId)
      .gte('created_at', fromISO).lt('created_at', toISO),

    // 10. Refunds/cancellations in period
    supabase.from('orders').select('id', { count: 'exact', head: true })
      .eq('establishment_id', estId)
      .in('status', ['refunded', 'cancelled'])
      .gte('created_at', fromISO).lt('created_at', toISO),

    // 11. Payments for current period
    supabase.from('payments')
      .select('method, amount, orders!inner(establishment_id, status, created_at)')
      .eq('orders.establishment_id', estId).eq('orders.status', 'paid')
      .gte('orders.created_at', fromISO).lt('orders.created_at', toISO),

    // 12. Cash session (always today's open session)
    supabase.from('cash_sessions').select('status, opened_at, total_sales, opening_float')
      .eq('establishment_id', estId)
      .gte('opened_at', todayStart.toISOString())
      .order('opened_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  // ── KPIs
  const ca      = (ordersCur ?? []).reduce((s, o) => s + (o.total_ttc ?? 0), 0)
  const caPrev  = (ordersPrev ?? []).reduce((s, o) => s + (o.total_ttc ?? 0), 0)
  const orders  = (ordersCur ?? []).length
  const ordersPrevCount = (ordersPrev ?? []).length
  const totalItems = (orderItems ?? []).reduce((s, i) => s + ((i as { quantity: number }).quantity ?? 1), 0)

  // ── Activity chart
  let hourlyActivity: { hour: number; count: number }[] = []
  let dailyTrend: { date: string; ca: number; orders: number }[] = []

  if (isToday) {
    const buckets: Record<number, number> = {}
    for (const o of (prevItems ?? []) as { created_at: string }[]) {
      const h = parseInt(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(new Date(o.created_at)))
      buckets[h] = (buckets[h] ?? 0) + 1
    }
    hourlyActivity = Array.from({ length: 13 }, (_, i) => ({ hour: 8 + i, count: buckets[8 + i] ?? 0 }))
  } else {
    const dayMap: Record<string, { ca: number; orders: number }> = {}
    for (const o of (prevItems ?? []) as { created_at: string; total_ttc: number }[]) {
      const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(o.created_at))
      if (!dayMap[date]) dayMap[date] = { ca: 0, orders: 0 }
      dayMap[date].ca += o.total_ttc ?? 0
      dayMap[date].orders++
    }
    dailyTrend = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }))
  }

  // ── Stock alerts
  const stockAlerts = ((stockItems ?? []) as { id: string; name: string; quantity: number; alert_threshold: number }[])
    .filter(s => s.quantity <= s.alert_threshold)
    .map(s => ({
      id: s.id, name: s.name, quantity: s.quantity, alertThreshold: s.alert_threshold,
      level: s.quantity <= s.alert_threshold * 0.4 ? 'critical' as const : 'low' as const,
    }))

  // ── Deliveries
  const pendingDeliveries = ((deliveries ?? []) as { id: string; supplier: string; created_at: string }[])
    .map(d => ({ id: d.id, supplierName: d.supplier, receivedAt: d.created_at }))

  // ── Top products
  const productMap: Record<string, { revenue: number; quantity: number }> = {}
  for (const item of orderItems ?? []) {
    const n = (item as { product_name: string }).product_name
    if (!productMap[n]) productMap[n] = { revenue: 0, quantity: 0 }
    productMap[n].revenue += (item as { line_total: number }).line_total ?? 0
    productMap[n].quantity += (item as { quantity: number }).quantity ?? 0
  }
  const topProducts = Object.entries(productMap)
    .sort(([, a], [, b]) => b.revenue - a.revenue).slice(0, 5)
    .map(([name, s], i) => ({ rank: i + 1, name, revenue: s.revenue, quantity: s.quantity }))

  // ── Recent orders
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentOrders = ((recentRaw ?? []) as any[] as {
    id: string; total_ttc: number; created_at: string
    customers: { first_name: string; last_name: string | null; tier: string } | null
    order_items: { product_name: string; quantity: number }[]
  }[]).map(o => {
    const items = o.order_items ?? []
    const ln = o.customers?.last_name
    return {
      id: o.id, orderNumber: null,
      customerName: o.customers ? `${o.customers.first_name}${ln ? ` ${ln.charAt(0)}.` : ''}` : null,
      customerTier: (o.customers?.tier ?? null) as 'standard' | 'silver' | 'gold' | null,
      totalAmount: o.total_ttc,
      itemsSummary: items.slice(0, 3).map(i => `${i.product_name}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ') + (items.length > 3 ? '…' : ''),
      createdAt: o.created_at,
    }
  })

  // ── Payment breakdown
  const payMap: Record<string, { amount: number; count: number }> = {}
  for (const p of (payments ?? []) as { method: string; amount: number }[]) {
    if (!payMap[p.method]) payMap[p.method] = { amount: 0, count: 0 }
    payMap[p.method].amount += p.amount ?? 0
    payMap[p.method].count++
  }
  const paymentBreakdown = Object.entries(payMap).map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.amount - a.amount)

  // ── Cash session
  const cs = cashSession as { status: string; opened_at: string | null; total_sales: number | null; opening_float: number } | null
  const cashSessionData = cs ? {
    status: cs.status === 'open' ? 'open' as const : 'closed' as const,
    openedAt: cs.opened_at,
    totalSales: cs.total_sales,
    openingFloat: cs.opening_float,
  } : null

  return {
    period: { from: fromISO, to: toISO, label: bounds.label, isToday },
    kpis: {
      ca, caPrev,
      orders, ordersPrev: ordersPrevCount,
      avgTicket: orders > 0 ? ca / orders : 0,
      avgTicketPrev: ordersPrevCount > 0 ? caPrev / ordersPrevCount : 0,
      loyalCustomers: new Set((loyaltyTx ?? []).map((t: { customer_id: string }) => t.customer_id)).size,
      newCustomers: (newCustomers as unknown as { count: number } | null)?.count ?? 0,
      refundCount: (refunds as unknown as { count: number } | null)?.count ?? 0,
      avgItemsPerOrder: orders > 0 ? Math.round((totalItems / orders) * 10) / 10 : 0,
    },
    cashSession: cashSessionData,
    paymentBreakdown,
    hourlyActivity,
    dailyTrend,
    stockAlerts,
    pendingDeliveries,
    topProducts,
    recentOrders,
  }
}
