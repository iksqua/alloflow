export interface RecipeIngredient {
  id: string
  recipe_id?: string
  name: string
  quantity: number
  unit: string
  unit_cost: number
  sort_order: number
}

export interface RecipeProduct {
  id: string
  name: string
  price: number
  tva_rate: number
  category_id: string | null
  is_active: boolean
}

export interface Recipe {
  id: string
  establishment_id: string
  title: string
  description: string | null
  category: string | null
  portion: string | null
  is_internal: boolean
  active: boolean
  created_at: string
  ingredients: RecipeIngredient[]
  product: RecipeProduct[] | null  // array from Supabase join; use [0] to access
  food_cost_amount: number
  food_cost_pct: number | null
}
