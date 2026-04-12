export type Period = 'today' | '7d' | '30d' | 'custom'

export interface PeriodRange {
  from: Date
  to: Date
}

export interface KpiSummary {
  caTtc: number
  caHt: number
  txCount: number
  avgTicket: number
  cashPct: number    // 0–100
  cardPct: number
  cashAmount: number
  cardAmount: number
  deltaCaTtc: number | null   // % vs previous period, null if no prev data
  deltaTxCount: number | null
  deltaAvgTicket: number | null
}

export interface DailyCA {
  day: string          // ISO date string YYYY-MM-DD
  caTtc: number
  txCount: number
}

export interface HourlyTx {
  hour: number         // 0–23
  txCount: number
}

export interface TopProduct {
  productId: string
  productName: string
  qtySold: number
  caTtc: number
  pct: number          // % of total CA
}

export interface OrderRow {
  id: string
  ticketNumber: string
  createdAt: string
  products: string     // compact label e.g. "Latte × 2, Cookie × 1"
  paymentMethod: 'card' | 'cash'
  amountHt: number
  tvaAmount: number
  amountTtc: number
}

export interface TvaBreakdown {
  rate: number         // 5.5, 10, or 20
  baseHt: number
  tvaAmount: number
}

export interface SiteSnapshot {
  establishmentId: string
  name: string
  caTtc: number
  txCount: number
  deltaPercent: number | null
}
