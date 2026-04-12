import { z } from 'zod'
import { uuidStr } from './uuid'

const stockItemFields = z.object({
  name:            z.string().min(1, 'Le nom est requis').max(100),
  category:        z.string().max(50).nullable().optional(),
  unit:            z.string().min(1, 'L\'unité est requise').max(20),
  quantity:        z.number().min(0).default(0),
  alert_threshold: z.number().min(0).default(0),
  unit_price:      z.number().min(0).default(0),
  order_quantity:  z.number().min(0).default(0),
  supplier:        z.string().max(100).nullable().optional(),
  supplier_ref:    z.string().max(100).nullable().optional(),
  purchase_price:  z.number().min(0).default(0),
  purchase_qty:    z.number().min(0).default(0),
  is_pos:          z.boolean().default(false),
  pos_price:       z.number().positive().nullable().optional(),
  pos_tva_rate:    z.number().refine(v => [5.5, 10, 20].includes(v)).default(10),
  pos_category_id: z.string().nullable().optional(),
})

const posRefine = <T extends { is_pos?: boolean; pos_price?: number | null }>(data: T) =>
  data.is_pos !== true || (data.pos_price != null && data.pos_price > 0)
const posRefineMsg = { message: 'Le prix de vente est requis pour un article vendu en caisse', path: ['pos_price'] }

export const createStockItemSchema = stockItemFields.refine(posRefine, posRefineMsg)

export const updateStockItemSchema = stockItemFields.partial().extend({
  active: z.boolean().optional(),
}).refine(posRefine, posRefineMsg)

export const createPurchaseOrderSchema = z.object({
  supplier:                z.string().min(1).max(100),
  supplier_email:          z.string().email().nullable().optional(),
  requested_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes:                   z.string().max(500).nullable().optional(),
  items: z.array(z.object({
    stock_item_id:    uuidStr,
    quantity_ordered: z.number().min(0.001),
    unit_price:       z.number().min(0),
  })).min(1, 'Au moins un article requis'),
})

export const receiveDeliverySchema = z.object({
  items: z.array(z.object({
    purchase_order_item_id: uuidStr,
    quantity_received:      z.number().min(0),
  })),
})

export type CreateStockItemInput     = z.infer<typeof createStockItemSchema>
export type UpdateStockItemInput     = z.infer<typeof updateStockItemSchema>
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>
export type ReceiveDeliveryInput     = z.infer<typeof receiveDeliverySchema>

export const patchPurchaseOrderSchema = z.object({
  supplier:                z.string().min(1).max(100).optional(),
  requested_delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes:                   z.string().max(500).nullable().optional(),
  // Lines to upsert (only those with quantity_received == 0 or new lines)
  upsert_items: z.array(z.object({
    id:               uuidStr.optional(),  // omit for new lines
    stock_item_id:    uuidStr,
    quantity_ordered: z.number().min(0.001),
    unit_price:       z.number().min(0),
  })).optional(),
  // IDs of lines to delete (only allowed if quantity_received is null/0)
  delete_item_ids: z.array(uuidStr).optional(),
})

export const receiveOrderSchema = z.object({
  notes: z.string().max(500).nullable().optional(),
  items: z.array(z.object({
    purchase_order_item_id: uuidStr,
    quantity_received:      z.number().min(0),
  })).min(1),
})

export type PatchPurchaseOrderInput = z.infer<typeof patchPurchaseOrderSchema>
export type ReceiveOrderInput       = z.infer<typeof receiveOrderSchema>
