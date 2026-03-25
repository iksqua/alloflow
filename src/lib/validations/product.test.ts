import { describe, it, expect } from 'vitest'
import { createProductSchema, updateProductSchema } from './product'

describe('createProductSchema', () => {
  it('valide un produit correct', () => {
    const result = createProductSchema.safeParse({
      name: 'Burger Classic',
      price: 12.50,
      category: 'plat',
      tva_rate: 10,
    })
    expect(result.success).toBe(true)
  })

  it('rejette un prix négatif', () => {
    const result = createProductSchema.safeParse({
      name: 'Burger',
      price: -5,
      category: 'plat',
      tva_rate: 10,
    })
    expect(result.success).toBe(false)
  })

  it('rejette un taux de TVA invalide', () => {
    const result = createProductSchema.safeParse({
      name: 'Burger',
      price: 10,
      category: 'plat',
      tva_rate: 15,
    })
    expect(result.success).toBe(false)
  })

  it('rejette une catégorie invalide', () => {
    const result = createProductSchema.safeParse({
      name: 'Burger',
      price: 10,
      category: 'sandwich',
      tva_rate: 10,
    })
    expect(result.success).toBe(false)
  })

  it('rejette un nom vide', () => {
    const result = createProductSchema.safeParse({
      name: '',
      price: 10,
      category: 'plat',
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

  it('rejette un objet vide', () => {
    const result = updateProductSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
