export interface Category {
  id: string
  establishment_id: string
  name: string
  color_hex: string
  icon: string | null
  sort_order: number
  products_count?: number
}

export interface Product {
  id: string
  establishment_id: string
  name: string
  emoji: string | null
  description: string | null
  price: number
  tva_rate: 5.5 | 10 | 20
  category_id: string | null
  category?: Category | null
  is_active: boolean
  sort_order: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export type BulkAction = 'activate' | 'deactivate' | 'delete' | 'change_category' | 'change_tva'
