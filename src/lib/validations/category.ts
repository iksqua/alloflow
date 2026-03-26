import { z } from 'zod'

export const createCategorySchema = z.object({
  name: z.string().min(1).max(50),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6b7280'),
  icon: z.string().max(10).nullish(),
  sort_order: z.number().int().optional(),
})

export const updateCategorySchema = createCategorySchema.partial()

export const reorderCategoriesSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
})
