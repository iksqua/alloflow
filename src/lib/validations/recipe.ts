// src/lib/validations/recipe.ts
import { z } from 'zod'

export const ingredientSchema = z.object({
  id:         z.string().uuid().optional(),   // optional — omit for new ingredients
  name:       z.string().min(1).max(100),
  quantity:   z.number().min(0.001, 'La quantité doit être supérieure à 0'),
  unit:       z.string().min(1).max(20),
  unit_cost:  z.number().min(0).default(0),
  sort_order: z.number().int().default(0),
})

export const posParamsSchema = z.object({
  price:       z.number().positive('Le prix de vente est requis'),
  tva_rate:    z.number().refine(v => [5.5, 10, 20].includes(v), 'TVA invalide'),
  // Preprocess: empty string / null / undefined → null to avoid "Invalid uuid" from unselected <select>
  // z.union instead of .nullable() because Zod v4 runs uuid() before null check
  category_id: z.preprocess(
    v => (v == null || v === '' ? null : v),
    z.union([z.string().uuid(), z.null()]).optional()
  ),
})

export const createRecipeSchema = z.object({
  title:       z.string().min(1).max(150),
  description: z.string().max(500).nullable().optional(),
  category:    z.string().max(80).nullable().optional(),
  portion:     z.string().max(50).nullable().optional(),
  is_internal: z.boolean().default(true),
  ingredients: z.array(ingredientSchema).default([]),
  pos:         posParamsSchema.nullable().optional(), // required if is_internal = false
}).refine(
  data => data.is_internal || (data.pos != null && data.pos.price > 0),
  { message: 'Le prix de vente est requis pour une recette POS', path: ['pos', 'price'] }
)

export const updateRecipeSchema = z.object({
  title:       z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
  category:    z.string().max(80).nullable().optional(),
  portion:     z.string().max(50).nullable().optional(),
  is_internal: z.boolean().optional(),
  pos:         posParamsSchema.nullable().optional(),
})

export const createIngredientSchema = z.object({
  name:       z.string().min(1).max(100),
  quantity:   z.number().min(0.001, 'La quantité doit être supérieure à 0'),
  unit:       z.string().min(1).max(20),
  unit_cost:  z.number().min(0).default(0),
  sort_order: z.number().int().default(0),
})

export const updateIngredientSchema = createIngredientSchema.partial()

export type CreateRecipeInput    = z.infer<typeof createRecipeSchema>
export type UpdateRecipeInput    = z.infer<typeof updateRecipeSchema>
export type CreateIngredientInput = z.infer<typeof createIngredientSchema>
