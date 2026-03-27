import { createClient } from '@/lib/supabase/server'
import type { Period, PeriodRange, KpiSummary, DailyCA, HourlyTx, TopProduct, OrderRow, TvaBreakdown } from './types'

export function getPeriodRange(period: Period): PeriodRange {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (period) {
    case 'today':
      return { from: today, to: now }
    case '7d':
      return { from: new Date(today.getTime() - 6 * 86400000), to: now }
    case '30d':
      return { from: new Date(today.getTime() - 29 * 86400000), to: now }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from, to: now }
    }
  }
}

export async function fetchKpiSummary(
  range: PeriodRange,
  establishmentId?: string
): Promise<KpiSummary> {
  const supabase = await createClient()

  // Fetch order totals
  let ordersQuery = supabase
    .from('orders')
    .select('id, total_ttc, subtotal_ht, tax_5_5, tax_10, tax_20')
    .eq('status', 'paid')
    .gte('created_at', range.from.toISOString())
    .lte('created_at', range.to.toISOString())

  if (establishmentId) ordersQuery = ordersQuery.eq('establishment_id', establishmentId)

  const { data: orderData, error: orderError } = await ordersQuery
  if (orderError) throw orderError

  const rows = orderData ?? []
  const orderIds = rows.map(r => r.id)

  const caTtc = rows.reduce((s, r) => s + (r.total_ttc ?? 0), 0)
  const caHt = rows.reduce((s, r) => s + (r.subtotal_ht ?? 0), 0)
  const txCount = rows.length
  const avgTicket = txCount > 0 ? caTtc / txCount : 0

  // Fetch payment methods for these orders
  let cashAmount = 0
  if (orderIds.length > 0) {
    const { data: payData, error: payError } = await supabase
      .from('payments')
      .select('order_id, method, amount')
      .in('order_id', orderIds)
      .eq('method', 'cash')
    if (payError) throw payError
    cashAmount = (payData ?? []).reduce((s, p) => s + (p.amount ?? 0), 0)
  }

  const cashPct = caTtc > 0 ? Math.round((cashAmount / caTtc) * 100) : 0

  return {
    caTtc, caHt, txCount, avgTicket,
    cashPct, cardPct: 100 - cashPct,
    cashAmount, cardAmount: caTtc - cashAmount,
    deltaCaTtc: null, deltaTxCount: null, deltaAvgTicket: null,
  }
}

export async function fetchDailyCA(
  range: PeriodRange,
  establishmentId?: string
): Promise<DailyCA[]> {
  const supabase = await createClient()
  let query = (supabase as any)
    .from('v_daily_ca')
    .select('day, ca_ttc, tx_count')
    .gte('day', range.from.toISOString())
    .lte('day', range.to.toISOString())
    .order('day', { ascending: true })

  if (establishmentId) query = query.eq('establishment_id', establishmentId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    day: r.day,
    caTtc: r.ca_ttc,
    txCount: r.tx_count,
  }))
}

export async function fetchHourlyTx(
  establishmentId?: string
): Promise<HourlyTx[]> {
  const supabase = await createClient()
  let query = (supabase as any)
    .from('v_hourly_tx')
    .select('hour, tx_count')
    .order('hour', { ascending: true })

  if (establishmentId) query = query.eq('establishment_id', establishmentId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    hour: r.hour,
    txCount: r.tx_count,
  }))
}

export async function fetchTopProducts(
  range: PeriodRange,
  establishmentId?: string,
  limit = 5
): Promise<TopProduct[]> {
  const supabase = await createClient()
  let query = (supabase as any)
    .from('v_top_products')
    .select('product_id, product_name, qty_sold, ca_ttc')
    .order('ca_ttc', { ascending: false })
    .limit(limit)

  if (establishmentId) query = query.eq('establishment_id', establishmentId)

  const { data, error } = await query
  if (error) throw error

  const rows = data ?? []
  const total = rows.reduce((s: number, r: any) => s + (r.ca_ttc ?? 0), 0)
  return rows.map((r: any) => ({
    productId: r.product_id,
    productName: r.product_name,
    qtySold: r.qty_sold,
    caTtc: r.ca_ttc,
    pct: total > 0 ? Math.round((r.ca_ttc / total) * 100) : 0,
  }))
}

export async function fetchOrdersForReport(
  range: PeriodRange,
  establishmentId?: string,
  page = 1,
  pageSize = 50
): Promise<{ rows: OrderRow[]; total: number }> {
  const supabase = await createClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('orders')
    .select(`
      id, created_at,
      total_ttc, subtotal_ht, tax_5_5, tax_10, tax_20,
      order_items ( quantity, product_name ),
      payments ( method, amount )
    `, { count: 'exact' })
    .eq('status', 'paid')
    .gte('created_at', range.from.toISOString())
    .lte('created_at', range.to.toISOString())
    .order('created_at', { ascending: false })
    .range(from, to)

  if (establishmentId) query = query.eq('establishment_id', establishmentId)

  const { data, count, error } = await query
  if (error) throw error

  const rows: OrderRow[] = (data ?? []).map((o: any) => {
    const items: string = (o.order_items ?? [])
      .slice(0, 3)
      .map((i: any) => `${i.product_name ?? '?'} × ${i.quantity}`)
      .join(', ')

    // Determine payment method from payments array
    const payments: any[] = o.payments ?? []
    const hasCash = payments.some((p: any) => p.method === 'cash')
    const paymentMethod: 'cash' | 'card' = hasCash ? 'cash' : 'card'

    const tvaAmount = (o.tax_5_5 ?? 0) + (o.tax_10 ?? 0) + (o.tax_20 ?? 0)

    return {
      id: o.id,
      ticketNumber: o.id.slice(0, 8).toUpperCase(),
      createdAt: o.created_at,
      products: items,
      paymentMethod,
      amountHt: o.subtotal_ht ?? 0,
      tvaAmount,
      amountTtc: o.total_ttc ?? 0,
    }
  })

  return { rows, total: count ?? 0 }
}

export async function fetchTvaBreakdown(
  range: PeriodRange,
  establishmentId?: string
): Promise<TvaBreakdown[]> {
  const supabase = await createClient()
  let query = (supabase as any)
    .from('v_tva_breakdown')
    .select('tva_rate, base_ht, tva_amount')
    .gte('day', range.from.toISOString())
    .lte('day', range.to.toISOString())

  if (establishmentId) query = query.eq('establishment_id', establishmentId)

  const { data, error } = await query
  if (error) throw error

  // Aggregate by rate
  const map = new Map<number, TvaBreakdown>()
  for (const r of data ?? []) {
    const rate = r.tva_rate as number
    const existing = map.get(rate) ?? { rate, baseHt: 0, tvaAmount: 0 }
    existing.baseHt += r.base_ht ?? 0
    existing.tvaAmount += r.tva_amount ?? 0
    map.set(rate, existing)
  }
  return Array.from(map.values()).sort((a, b) => a.rate - b.rate)
}
