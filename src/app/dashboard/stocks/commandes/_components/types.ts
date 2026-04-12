// src/app/dashboard/stocks/commandes/_components/types.ts

export type PurchaseOrderStatus = 'pending' | 'partial' | 'received' | 'cancelled'

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  stock_item_id: string
  quantity_ordered: number
  unit_price: number
  quantity_received: number | null  // null = never received, treat as 0
  sort_order: number
  stock_item?: { id: string; name: string; unit: string }
}

export interface PurchaseOrderReceptionLine {
  purchase_order_item_id: string
  quantity_received: number
}

export interface PurchaseOrderReception {
  id: string
  purchase_order_id: string
  received_at: string
  notes: string | null
  lines: PurchaseOrderReceptionLine[]
}

export interface PurchaseOrder {
  id: string
  establishment_id: string
  order_ref: string
  supplier: string
  supplier_email: string | null
  requested_delivery_date: string | null
  status: PurchaseOrderStatus
  total_ht: number
  notes: string | null
  created_at: string
  created_by: string | null
  items?: PurchaseOrderItem[]
  receptions?: PurchaseOrderReception[]
}

/** Computed per-item remaining quantity (quantity_received may be null → treat as 0) */
export function remaining(item: PurchaseOrderItem): number {
  return item.quantity_ordered - (item.quantity_received ?? 0)
}

/** Human-readable status label */
export function statusLabel(status: PurchaseOrderStatus): string {
  const labels: Record<PurchaseOrderStatus, string> = {
    pending: 'En cours', partial: 'Partielle', received: 'Reçue', cancelled: 'Annulée',
  }
  return labels[status]
}

/** CSS classes for status badge */
export function statusBadgeClass(status: PurchaseOrderStatus): string {
  const classes: Record<PurchaseOrderStatus, string> = {
    pending:   'bg-blue-900/30 text-blue-400',
    partial:   'bg-amber-900/30 text-amber-400',
    received:  'bg-green-900/30 text-green-400',
    cancelled: 'bg-[var(--surface2)] text-[var(--text4)]',
  }
  return classes[status]
}

/** True if the order's delivery date is overdue */
export function isLate(order: PurchaseOrder): boolean {
  if (!order.requested_delivery_date) return false
  if (order.status !== 'pending' && order.status !== 'partial') return false
  // Parse both as local midnight to avoid UTC/local timezone mismatch
  const [y, m, d] = order.requested_delivery_date.split('-').map(Number)
  const delivery = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return delivery < today
}
