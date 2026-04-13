import { describe, it, expect } from 'vitest'
import { sopPayloadSchema, ingredientPayloadSchema, createCatalogueItemSchema } from '../validations/catalogue'

describe('sopPayloadSchema', () => {
  it('rejects empty steps array', () => {
    const result = sopPayloadSchema.safeParse({ steps: [] })
    expect(result.success).toBe(false)
  })

  it('rejects step missing title', () => {
    const result = sopPayloadSchema.safeParse({
      steps: [{ sort_order: 0, title: '', description: 'desc' }]
    })
    expect(result.success).toBe(false)
  })

  it('rejects step missing description', () => {
    const result = sopPayloadSchema.safeParse({
      steps: [{ sort_order: 0, title: 'title', description: '' }]
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid step with required fields only', () => {
    const result = sopPayloadSchema.safeParse({
      steps: [{ sort_order: 0, title: 'title', description: 'desc' }]
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid step with all optional fields', () => {
    const result = sopPayloadSchema.safeParse({
      steps: [{
        sort_order: 0, title: 'title', description: 'desc',
        duration_seconds: 60, media_url: null, note_type: 'warning', note_text: 'Be careful'
      }]
    })
    expect(result.success).toBe(true)
  })
})

describe('ingredientPayloadSchema', () => {
  it('rejects invalid unit', () => {
    const result = ingredientPayloadSchema.safeParse({ unit: 'lb' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid units', () => {
    for (const unit of ['g', 'kg', 'ml', 'cl', 'L', 'pièce']) {
      const result = ingredientPayloadSchema.safeParse({ unit })
      expect(result.success).toBe(true)
    }
  })

  it('accepts valid unit with category', () => {
    const result = ingredientPayloadSchema.safeParse({ unit: 'kg', category: 'Pâtisserie' })
    expect(result.success).toBe(true)
  })
})

describe('createCatalogueItemSchema', () => {
  it('rejects invalid available_from format', () => {
    const result = createCatalogueItemSchema.safeParse({
      type: 'product', name: 'Test', available_from: '13/04/2026'
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid available_from date string', () => {
    const result = createCatalogueItemSchema.safeParse({
      type: 'product', name: 'Test', available_from: '2026-09-01'
    })
    expect(result.success).toBe(true)
  })

  it('accepts ingredient type', () => {
    const result = createCatalogueItemSchema.safeParse({
      type: 'ingredient', name: 'Farine T45'
    })
    expect(result.success).toBe(true)
  })
})
