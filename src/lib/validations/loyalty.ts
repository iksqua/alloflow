// src/lib/validations/loyalty.ts
import { z } from 'zod'

export const createCustomerSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name:  z.string().max(100).nullable().optional(),
  phone:      z.string().min(6).max(20).nullable().optional(),
  email:      z.string().email().nullable().optional(),
}).refine(d => d.phone || d.email, {
  message: 'Phone ou email requis',
})

export const applyRewardSchema = z.object({
  order_id:    z.string().uuid(),
  reward_id:   z.string().uuid(),
  customer_id: z.string().uuid(),
})

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>
export type ApplyRewardInput    = z.infer<typeof applyRewardSchema>
