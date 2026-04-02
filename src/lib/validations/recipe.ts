// src/lib/validations/recipe.ts
import { z } from 'zod'
import { uuidStr } from './uuid'

export const ingredientSchema = z.object({
  id:         uuidStr.optional(),   // optional — omit for new ingredients
  name:       z.string().min(1).max(100),
  quantity:   z.number().min(0.001, 'La quantité doit être supérieure à 0'),
  unit:       z.string().min(1).max(20),
  unit_cost:  z.number().min(0).default(0),
  sort_order: z.number().int().default(0),
})

export const posParamsSchema = z.object({
  price:       z.number().positive('Le prix de vente est requis'),
  tva_rate:    z.number().refine(v => [5.5, 10, 20].includes(v), 'TVA invalide'),
  // Zod v4: uuid() validation breaks with nullable — skip format validation, DB enforces UUID constraint
  category_id: z.string().nullable().optional(),
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
  ingredients: z.array(ingredientSchema).optional(),
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
