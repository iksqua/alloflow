import { z } from 'zod'

export const createStockItemSchema = z.object({
  name:           z.string().min(1, 'Le nom est requis').max(100),
  category:       z.string().max(50).nullable().optional(),
  unit:           z.string().min(1, 'L\'unité est requise').max(20),
  quantity:       z.number().min(0).default(0),
  alert_threshold:z.number().min(0).default(0),
  unit_price:     z.number().min(0).default(0),
  order_quantity: z.number().min(0).default(0),
  supplier:       z.string().max(100).nullable().optional(),
  supplier_ref:   z.string().max(100).nullable().optional(),
  purchase_price: z.number().min(0).default(0),
  purchase_qty:   z.number().min(0).default(0),
})

export const updateStockItemSchema = createStockItemSchema.partial().extend({
  active: z.boolean().optional(),
})

export const createPurchaseOrderSchema = z.object({
  supplier:                z.string().min(1).max(100),
  supplier_email:          z.string().email().nullable().optional(),
  requested_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes:                   z.string().max(500).nullable().optional(),
  items: z.array(z.object({
    stock_item_id:   z.string().uuid(),
    quantity_ordered:z.number().min(0.001),
    unit_price:      z.number().min(0),
  })).min(1, 'Au moins un article requis'),
})

export const receiveDeliverySchema = z.object({
  items: z.array(z.object({
    purchase_order_item_id: z.string().uuid(),
    quantity_received:      z.number().min(0),
  })),
})

export type CreateStockItemInput  = z.infer<typeof createStockItemSchema>
export type UpdateStockItemInput  = z.infer<typeof updateStockItemSchema>
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>
export type ReceiveDeliveryInput  = z.infer<typeof receiveDeliverySchema>
