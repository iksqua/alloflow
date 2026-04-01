// src/app/caisse/pos/types.ts

export interface CashSession {
  id: string
  establishment_id: string
  opened_by: string
  opened_at: string
  closed_at: string | null
  opening_float: number
  status: 'open' | 'closed'
}

export interface Room {
  id: string
  name: string
  sort_order: number
}

export interface RestaurantTable {
  id: string
  room_id: string | null
  name: string
  seats: number
  status: 'free' | 'occupied' | 'reserved'
  current_order_id: string | null
}

export interface OrderItem {
  id: string
  product_id: string
  product_name: string
  emoji: string | null
  unit_price: number   // HT
  tva_rate: number
  quantity: number
  discount_pct: number
  line_total: number   // TTC
  note: string | null
}

export interface Order {
  id: string
  session_id: string | null
  table_id: string | null
  cashier_id: string
  status: 'open' | 'paying' | 'paid' | 'cancelled' | 'refunded'
  subtotal_ht: number
  tax_5_5: number
  tax_10: number
  tax_20: number
  discount_type: 'percent' | 'amount' | null
  discount_value: number | null
  discount_amount: number
  total_ttc: number
  items: OrderItem[]
  created_at: string
}

export interface Payment {
  id: string
  method: 'card' | 'cash' | 'ticket_resto'
  amount: number
  cash_given: number | null
  change_due: number | null
}

// État local POS (non sauvegardé avant paiement)
export interface LocalTicket {
  items: LocalItem[]
  discount: { type: 'percent' | 'amount'; value: number } | null
  tableId: string | null
  note: string
}

export interface LocalItem {
  productId: string
  productName: string
  emoji: string | null
  unitPriceHt: number
  tvaRate: number
  quantity: number
}

export type PaymentMode = 'card' | 'cash' | 'split'

// Loyalty types (Sprint 6)
export interface LoyaltyCustomer {
  id: string
  first_name: string
  last_name: string | null
  phone: string | null
  email: string | null
  points: number
  tier: 'standard' | 'silver' | 'gold'
}

export interface LoyaltyReward {
  id: string
  name: string
  points_required: number
  type: 'percent' | 'fixed' | 'product' | 'produit_offert' | 'reduction_euros' | 'reduction_pct'
  value: number
  active?: boolean
}

export interface SplitPerson {
  label: string              // "P1", "P2", ...
  amount: number             // montant final après remises (arrondi centimes)
  method: 'card' | 'cash'
}
