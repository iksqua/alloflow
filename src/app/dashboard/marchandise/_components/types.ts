// src/app/dashboard/marchandise/_components/types.ts

export type NetworkStatus = 'active' | 'inactive' | 'coming_soon' | 'not_shared'

// Marchandise = stock_item enriched
export interface MarchandiseItem {
  id: string
  establishment_id: string
  name: string
  category: string | null
  unit: string
  purchase_price: number        // prix d'achat HT
  purchase_qty: number          // quantité par unité d'achat
  supplier: string | null
  supplier_ref: string | null
  is_pos: boolean               // vendu en caisse directement
  pos_price: number | null      // prix TTC caisse (si is_pos)
  pos_tva_rate: number          // TVA % (défaut 10)
  pos_category_id: string | null
  product_id: string | null
  active: boolean
  network_status: NetworkStatus
}

// Article en vente = direct ou recette
export type EnVenteOrigin = 'direct' | 'recette'

export interface EnVenteItem {
  id: string                    // product_id
  name: string
  origin: EnVenteOrigin
  source_id: string             // stock_item.id ou recipe.id
  category_id: string | null
  category_name: string | null
  price_ttc: number
  tva_rate: number
  food_cost_pct: number | null  // null pour direct, calculé pour recettes
  margin_pct: number | null
  network_status: NetworkStatus
}

export interface SopStep {
  id: string
  sop_id: string
  title: string
  description: string
  sort_order: number
  duration_seconds: number | null
  media_url: string | null
}

export interface SopWithSteps {
  id: string
  title: string
  recipe_id: string | null
  active: boolean
  steps: SopStep[]
}

// Recette enrichie pour l'onglet Recettes
export interface RecipeRow {
  id: string
  establishment_id: string
  title: string
  category: string | null
  portion: string | null
  is_internal: boolean          // false = vendu en POS
  active: boolean
  sop_required: boolean
  network_status: NetworkStatus
  ingredients: {
    id: string
    name: string
    quantity: number
    unit: string
    unit_cost: number
    sort_order: number
  }[]
  product: {
    id: string
    name: string
    price: number               // HT en DB
    tva_rate: number
    category_id: string | null
    is_active: boolean
  } | null
  sop: SopWithSteps | null
  food_cost_amount: number
  food_cost_pct: number | null
}

export interface PosCategory {
  id: string
  name: string
  color_hex: string
  icon?: string | null
}
