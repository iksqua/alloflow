import { z } from 'zod'

export const createProductSchema = z.object({
  name: z.string().min(1, 'Le nom est requis'),
  emoji: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  price: z.number().min(0, 'Le prix doit être positif'),
  tva_rate: z.union([
    z.literal(5.5),
    z.literal(10),
    z.literal(20),
  ], { message: 'TVA invalide (5.5, 10 ou 20)' }),
  category_id: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
})

export const updateProductSchema = createProductSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ est requis',
  })

export type CreateProductInput = z.infer<typeof createProductSchema>
export type UpdateProductInput = z.infer<typeof updateProductSchema>
