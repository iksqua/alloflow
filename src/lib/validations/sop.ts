// src/lib/validations/sop.ts
import { z } from 'zod'

export const sopCategorySchema = z.object({
  name:       z.string().min(1).max(80),
  emoji:      z.string().max(10).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
})

export const updateSopCategorySchema = sopCategorySchema.partial()

export const sopStepSchema = z.object({
  title:            z.string().min(1).max(200),
  description:      z.string().max(2000).default(''),
  sort_order:       z.number().int().min(0),
  duration_seconds: z.number().int().positive().nullable().optional(),
  media_url:        z.string().url().nullable().optional(),
  note_type:        z.enum(['warning', 'tip']).nullable().optional(),
  note_text:        z.string().max(500).nullable().optional(),
})

export const createSopSchema = z.object({
  title:       z.string().min(1).max(200),
  content:     z.string().max(2000).nullable().optional(),   // general notes
  category_id: z.string().nullable().optional(),
  recipe_id:   z.string().nullable().optional(),
  steps:       z.array(sopStepSchema).default([]),
})

export const updateSopSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  content:     z.string().max(2000).nullable().optional(),
  category_id: z.string().nullable().optional(),
  recipe_id:   z.string().nullable().optional(),
})

export type SopCategoryInput       = z.infer<typeof sopCategorySchema>
export type CreateSopInput         = z.infer<typeof createSopSchema>
export type UpdateSopInput         = z.infer<typeof updateSopSchema>
export type SopStepInput           = z.infer<typeof sopStepSchema>
