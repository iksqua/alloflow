// src/app/dashboard/stocks/_components/types.ts
export type StockStatus = 'ok' | 'alert' | 'out_of_stock'

export interface StockItem {
  id: string
  establishment_id: string
  name: string
  category: string | null
  unit: string
  quantity: number
  alert_threshold: number
  unit_price: number
  order_quantity: number
  supplier: string | null
  supplier_ref: string | null
  purchase_price: number
  purchase_qty: number
  is_pos: boolean
  pos_price: number | null
  pos_tva_rate: number
  pos_category_id: string | null
  product_id: string | null
  active: boolean
  status: StockStatus
}

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  stock_item_id: string
  quantity_ordered: number
  unit_price: number
  quantity_received: number | null
  sort_order: number
  stock_item?: Pick<StockItem, 'id' | 'name' | 'unit'>
}

export interface PurchaseOrder {
  id: string
  establishment_id: string
  order_ref: string
  supplier: string
  supplier_email: string | null
  requested_delivery_date: string | null
  status: 'draft' | 'sent' | 'received' | 'partial'
  total_ht: number
  notes: string | null
  created_at: string
  items?: PurchaseOrderItem[]
}
