import { z } from 'zod'

export const createCatalogueItemSchema = z.object({
  type:           z.enum(['product', 'recipe', 'sop', 'ingredient']),
  name:           z.string().min(1).max(100),
  description:    z.string().max(500).optional(),
  is_mandatory:   z.boolean().default(false),
  is_seasonal:    z.boolean().default(false),
  expires_at:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  available_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  payload:        z.record(z.string(), z.unknown()).default({}),
})

export const updateCatalogueItemSchema = createCatalogueItemSchema.partial()

export const updateEstablishmentCatalogItemSchema = z.object({
  local_price:           z.number().positive().nullable().optional(),
  local_stock_threshold: z.number().int().min(0).nullable().optional(),
  is_active:             z.boolean().optional(),
})

// Payload validators (used in publish route to enforce SOP min steps)
export const sopPayloadSchema = z.object({
  steps: z.array(z.object({
    sort_order:       z.number(),
    title:            z.string().min(1),
    description:      z.string().min(1),
    duration_seconds: z.number().nullable().optional(),
    media_url:        z.string().nullable().optional(),
    note_type:        z.enum(['warning', 'tip']).nullable().optional(),
    note_text:        z.string().nullable().optional(),
  })).min(1, 'Un SOP doit avoir au moins une étape'),
})

export const ingredientPayloadSchema = z.object({
  unit:     z.enum(['g', 'kg', 'ml', 'cl', 'L', 'pièce']),
  category: z.string().optional(),
})

export type CreateCatalogueItemInput  = z.infer<typeof createCatalogueItemSchema>
export type UpdateCatalogueItemInput  = z.infer<typeof updateCatalogueItemSchema>
export type UpdateEstablishmentCatalogItemInput = z.infer<typeof updateEstablishmentCatalogItemSchema>
