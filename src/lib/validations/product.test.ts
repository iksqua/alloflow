import { describe, it, expect } from 'vitest'
import { createProductSchema, updateProductSchema } from './product'

describe('createProductSchema', () => {
  it('valide un produit correct', () => {
    const result = createProductSchema.safeParse({
      name: 'Latte Vanille',
      price: 4.50,
      tva_rate: 10,
    })
    expect(result.success).toBe(true)
  })

  it('valide un produit avec category_id', () => {
    const result = createProductSchema.safeParse({
      name: 'Cookie Choco',
      price: 2.50,
      tva_rate: 5.5,
      category_id: 'some-uuid',
    })
    expect(result.success).toBe(true)
  })

  it('rejette un prix négatif', () => {
    const result = createProductSchema.safeParse({
      name: 'Burger',
      price: -5,
      tva_rate: 10,
    })
    expect(result.success).toBe(false)
  })

  it('rejette un taux de TVA invalide', () => {
    const result = createProductSchema.safeParse({
      name: 'Burger',
      price: 10,
      tva_rate: 15,
    })
    expect(result.success).toBe(false)
  })

  it('rejette un nom vide', () => {
    const result = createProductSchema.safeParse({
      name: '',
      price: 10,
      tva_rate: 10,
    })
    expect(result.success).toBe(false)
  })
})

describe('updateProductSchema', () => {
  it('accepte une mise à jour partielle', () => {
    const result = updateProductSchema.safeParse({ price: 15.00 })
    expect(result.success).toBe(true)
  })

  it('accepte is_active seul', () => {
    const result = updateProductSchema.safeParse({ is_active: false })
    expect(result.success).toBe(true)
  })

  it('rejette un objet vide', () => {
    const result = updateProductSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
