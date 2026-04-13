import { describe, it, expect } from 'vitest'

type IngData = {
  id: string
  name: string
  network_catalog_item_data: { payload: Record<string, unknown> } | Array<{ payload: Record<string, unknown> }> | null
}

function buildStockRow(ing: IngData, establishmentId: string) {
  const data = Array.isArray(ing.network_catalog_item_data)
    ? ing.network_catalog_item_data[0]
    : ing.network_catalog_item_data
  const payload = data?.payload as {
    unit?: string
    reference_package_price?: number
    reference_package_size?: number
  } | undefined

  const refPrice = payload?.reference_package_price
  const refSize  = payload?.reference_package_size
  const unit_price =
    refPrice && refSize
      ? Math.round(refPrice / refSize * 1e6) / 1e6
      : undefined

  return {
    establishment_id: establishmentId,
    name:             ing.name,
    unit:             payload?.unit ?? 'pièce',
    quantity:         0,
    alert_threshold:  0,
    active:           true,
    ...(unit_price !== undefined ? { unit_price } : {}),
  }
}

describe('buildStockRow', () => {
  const estId = 'est-1'

  it('sets unit_price when both reference price fields are present', () => {
    const row = buildStockRow({
      id: '1', name: 'Sirop vanille',
      network_catalog_item_data: { payload: { unit: 'ml', reference_package_price: 7.45, reference_package_size: 750 } },
    }, estId)
    expect(row.unit_price).toBe(Math.round(7.45 / 750 * 1e6) / 1e6)
    expect(row.unit).toBe('ml')
  })

  it('omits unit_price when no reference price', () => {
    const row = buildStockRow({
      id: '2', name: 'Farine',
      network_catalog_item_data: { payload: { unit: 'kg' } },
    }, estId)
    expect('unit_price' in row).toBe(false)
  })

  it('omits unit_price when only one field present', () => {
    const row = buildStockRow({
      id: '3', name: 'Sel',
      network_catalog_item_data: { payload: { unit: 'g', reference_package_price: 1.5 } },
    }, estId)
    expect('unit_price' in row).toBe(false)
  })

  it('handles array-shaped network_catalog_item_data', () => {
    const row = buildStockRow({
      id: '4', name: 'Sucre',
      network_catalog_item_data: [{ payload: { unit: 'kg', reference_package_price: 2.0, reference_package_size: 1000 } }],
    }, estId)
    expect(row.unit_price).toBeDefined()
    expect(row.unit).toBe('kg')
  })

  it('handles null network_catalog_item_data', () => {
    const row = buildStockRow({ id: '5', name: 'Eau', network_catalog_item_data: null }, estId)
    expect(row.unit).toBe('pièce')
    expect('unit_price' in row).toBe(false)
  })
})
