import { z } from 'zod'

const CATEGORIES = ['entree', 'plat', 'dessert', 'boisson', 'autre'] as const

export const createProductSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  price: z.number().min(0, 'Le prix doit être positif'),
  category: z.enum(CATEGORIES, { message: 'Catégorie invalide' }),
  tva_rate: z.union([
    z.literal(5.5),
    z.literal(10),
    z.literal(20),
  ], { message: 'TVA invalide (5.5, 10 ou 20)' }),
})

export const updateProductSchema = createProductSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ est requis',
  })

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
