export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: { id: string; name: string; type: 'siege' | 'franchise' | 'independent'; parent_org_id: string | null; created_at: string }
        Insert: { id?: string; name: string; type?: 'siege' | 'franchise' | 'independent'; parent_org_id?: string | null; created_at?: string }
        Update: { id?: string; name?: string; type?: 'siege' | 'franchise' | 'independent'; parent_org_id?: string | null; created_at?: string }
        Relationships: [
          { foreignKeyName: "organizations_parent_org_id_fkey"; columns: ["parent_org_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ]
      }
      establishments: {
        Row: { id: string; name: string; address: string | null; org_id: string; created_at: string; siret: string | null; receipt_footer: string }
        Insert: { id?: string; name: string; address?: string | null; org_id: string; created_at?: string; siret?: string | null; receipt_footer?: string }
        Update: { id?: string; name?: string; address?: string | null; org_id?: string; created_at?: string; siret?: string | null; receipt_footer?: string }
        Relationships: [
          { foreignKeyName: "establishments_org_id_fkey"; columns: ["org_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ]
      }
      franchise_contracts: {
        Row: {
          id: string
          org_id: string
          establishment_id: string
          royalty_rate: number
          marketing_rate: number
          start_date: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          establishment_id: string
          royalty_rate?: number
          marketing_rate?: number
          start_date: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          establishment_id?: string
          royalty_rate?: number
          marketing_rate?: number
          start_date?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "franchise_contracts_org_id_fkey"; columns: ["org_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
          { foreignKeyName: "franchise_contracts_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] }
        ]
      }
      network_customers: {
        Row: {
          id: string
          org_id: string
          phone: string
          first_name: string
          last_name: string | null
          email: string | null
          total_points: number
          tier: 'standard' | 'silver' | 'gold'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          phone: string
          first_name?: string
          last_name?: string | null
          email?: string | null
          total_points?: number
          tier?: 'standard' | 'silver' | 'gold'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          phone?: string
          first_name?: string
          last_name?: string | null
          email?: string | null
          total_points?: number
          tier?: 'standard' | 'silver' | 'gold'
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "network_customers_org_id_fkey"; columns: ["org_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ]
      }
      network_loyalty_config: {
        Row: {
          id: string
          org_id: string
          active: boolean
          pts_per_euro: number
          min_redemption_pts: number
          levels: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          active?: boolean
          pts_per_euro?: number
          min_redemption_pts?: number
          levels?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          active?: boolean
          pts_per_euro?: number
          min_redemption_pts?: number
          levels?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "network_loyalty_config_org_id_fkey"; columns: ["org_id"]; isOneToOne: true; referencedRelation: "organizations"; referencedColumns: ["id"] }
        ]
      }
      profiles: {
        Row: { id: string; first_name: string; email: string | null; role: 'super_admin' | 'admin' | 'caissier' | 'franchise_admin'; establishment_id: string | null; org_id: string | null; created_at: string }
        Insert: { id: string; first_name?: string; email?: string | null; role?: 'super_admin' | 'admin' | 'caissier' | 'franchise_admin'; establishment_id?: string | null; org_id?: string | null; created_at?: string }
        Update: { id?: string; first_name?: string; email?: string | null; role?: 'super_admin' | 'admin' | 'caissier' | 'franchise_admin'; establishment_id?: string | null; org_id?: string | null; created_at?: string }
        Relationships: [
          { foreignKeyName: "profiles_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] }
        ]
      }
      categories: {
        Row: { id: string; establishment_id: string; name: string; color_hex: string; icon: string | null; sort_order: number; created_at: string; updated_at: string }
        Insert: { id?: string; establishment_id: string; name: string; color_hex?: string; icon?: string | null; sort_order?: number; created_at?: string; updated_at?: string }
        Update: { id?: string; establishment_id?: string; name?: string; color_hex?: string; icon?: string | null; sort_order?: number; created_at?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "categories_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] }
        ]
      }
      products: {
        Row: { id: string; name: string; price: number; category: string; tva_rate: number; establishment_id: string; is_active: boolean; emoji: string | null; description: string | null; category_id: string | null; sort_order: number; deleted_at: string | null; recipe_id: string | null; created_at: string }
        Insert: { id?: string; name: string; price: number; category?: string; tva_rate: number; establishment_id: string; is_active?: boolean; emoji?: string | null; description?: string | null; category_id?: string | null; sort_order?: number; deleted_at?: string | null; recipe_id?: string | null; created_at?: string }
        Update: { id?: string; name?: string; price?: number; category?: string; tva_rate?: number; establishment_id?: string; is_active?: boolean; emoji?: string | null; description?: string | null; category_id?: string | null; sort_order?: number; deleted_at?: string | null; recipe_id?: string | null; created_at?: string }
        Relationships: [
          { foreignKeyName: "products_category_id_fkey"; columns: ["category_id"]; isOneToOne: false; referencedRelation: "categories"; referencedColumns: ["id"] },
          { foreignKeyName: "products_recipe_id_fkey"; columns: ["recipe_id"]; isOneToOne: false; referencedRelation: "recipes"; referencedColumns: ["id"] },
          { foreignKeyName: "products_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] }
        ]
      }
      cash_sessions: {
        Row: { id: string; establishment_id: string; opened_by: string; opened_at: string; closed_by: string | null; closed_at: string | null; opening_float: number; closing_float: number | null; total_cash: number | null; total_card: number | null; total_sales: number | null; status: 'open' | 'closed' }
        Insert: { id?: string; establishment_id: string; opened_by: string; opened_at?: string; closed_by?: string | null; closed_at?: string | null; opening_float?: number; closing_float?: number | null; total_cash?: number | null; total_card?: number | null; total_sales?: number | null; status?: 'open' | 'closed' }
        Update: { id?: string; establishment_id?: string; opened_by?: string; opened_at?: string; closed_by?: string | null; closed_at?: string | null; opening_float?: number; closing_float?: number | null; total_cash?: number | null; total_card?: number | null; total_sales?: number | null; status?: 'open' | 'closed' }
        Relationships: [
          { foreignKeyName: "cash_sessions_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] }
        ]
      }
      rooms: {
        Row: { id: string; establishment_id: string; name: string; sort_order: number }
        Insert: { id?: string; establishment_id: string; name: string; sort_order?: number }
        Update: { id?: string; establishment_id?: string; name?: string; sort_order?: number }
        Relationships: [
          { foreignKeyName: "rooms_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] }
        ]
      }
      restaurant_tables: {
        Row: { id: string; establishment_id: string; room_id: string | null; name: string; seats: number; status: 'free' | 'occupied' | 'reserved'; current_order_id: string | null; x_pos: number; y_pos: number }
        Insert: { id?: string; establishment_id: string; room_id?: string | null; name: string; seats?: number; status?: 'free' | 'occupied' | 'reserved'; current_order_id?: string | null; x_pos?: number; y_pos?: number }
        Update: { id?: string; establishment_id?: string; room_id?: string | null; name?: string; seats?: number; status?: 'free' | 'occupied' | 'reserved'; current_order_id?: string | null; x_pos?: number; y_pos?: number }
        Relationships: [
          { foreignKeyName: "restaurant_tables_room_id_fkey"; columns: ["room_id"]; isOneToOne: false; referencedRelation: "rooms"; referencedColumns: ["id"] },
          { foreignKeyName: "fk_table_current_order"; columns: ["current_order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] }
        ]
      }
      orders: {
        Row: { id: string; establishment_id: string; session_id: string | null; table_id: string | null; cashier_id: string; status: 'open' | 'paying' | 'paid' | 'cancelled' | 'refunded'; subtotal_ht: number; tax_5_5: number; tax_10: number; tax_20: number; discount_type: 'percent' | 'amount' | null; discount_value: number | null; discount_amount: number; total_ttc: number; note: string | null; customer_id: string | null; reward_id: string | null; reward_discount_amount: number | null; created_at: string; updated_at: string }
        Insert: { id?: string; establishment_id: string; session_id?: string | null; table_id?: string | null; cashier_id: string; status?: 'open' | 'paying' | 'paid' | 'cancelled' | 'refunded'; subtotal_ht?: number; tax_5_5?: number; tax_10?: number; tax_20?: number; discount_type?: 'percent' | 'amount' | null; discount_value?: number | null; discount_amount?: number; total_ttc?: number; note?: string | null; customer_id?: string | null; reward_id?: string | null; reward_discount_amount?: number | null; created_at?: string; updated_at?: string }
        Update: { id?: string; establishment_id?: string; session_id?: string | null; table_id?: string | null; cashier_id?: string; status?: 'open' | 'paying' | 'paid' | 'cancelled' | 'refunded'; subtotal_ht?: number; tax_5_5?: number; tax_10?: number; tax_20?: number; discount_type?: 'percent' | 'amount' | null; discount_value?: number | null; discount_amount?: number; total_ttc?: number; note?: string | null; customer_id?: string | null; reward_id?: string | null; reward_discount_amount?: number | null; created_at?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "orders_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
          { foreignKeyName: "orders_reward_id_fkey"; columns: ["reward_id"]; isOneToOne: false; referencedRelation: "loyalty_rewards"; referencedColumns: ["id"] }
        ]
      }
      order_items: {
        Row: { id: string; order_id: string; product_id: string; product_name: string; emoji: string | null; unit_price: number; tva_rate: number; quantity: number; discount_pct: number | null; line_total: number; note: string | null; created_at: string }
        Insert: { id?: string; order_id: string; product_id: string; product_name: string; emoji?: string | null; unit_price: number; tva_rate: number; quantity?: number; discount_pct?: number | null; line_total: number; note?: string | null; created_at?: string }
        Update: { id?: string; order_id?: string; product_id?: string; product_name?: string; emoji?: string | null; unit_price?: number; tva_rate?: number; quantity?: number; discount_pct?: number | null; line_total?: number; note?: string | null; created_at?: string }
        Relationships: [
          { foreignKeyName: "order_items_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] },
          { foreignKeyName: "order_items_product_id_fkey"; columns: ["product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] }
        ]
      }
      payments: {
        Row: { id: string; order_id: string; method: 'card' | 'cash' | 'ticket_resto'; amount: number; cash_given: number | null; change_due: number | null; tpe_ref: string | null; created_at: string }
        Insert: { id?: string; order_id: string; method: 'card' | 'cash' | 'ticket_resto'; amount: number; cash_given?: number | null; change_due?: number | null; tpe_ref?: string | null; created_at?: string }
        Update: { id?: string; order_id?: string; method?: 'card' | 'cash' | 'ticket_resto'; amount?: number; cash_given?: number | null; change_due?: number | null; tpe_ref?: string | null; created_at?: string }
        Relationships: [
          { foreignKeyName: "payments_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] }
        ]
      }
      stock_items: {
        Row: { id: string; establishment_id: string; name: string; quantity: number; unit: string; alert_threshold: number; category: string | null; supplier: string | null; supplier_ref: string | null; unit_price: number; order_quantity: number; active: boolean }
        Insert: { id?: string; establishment_id: string; name: string; quantity?: number; unit: string; alert_threshold?: number; category?: string | null; supplier?: string | null; supplier_ref?: string | null; unit_price?: number; order_quantity?: number; active?: boolean }
        Update: { id?: string; establishment_id?: string; name?: string; quantity?: number; unit?: string; alert_threshold?: number; category?: string | null; supplier?: string | null; supplier_ref?: string | null; unit_price?: number; order_quantity?: number; active?: boolean }
        Relationships: [
          { foreignKeyName: "stock_items_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] }
        ]
      }
      purchase_orders: {
        Row: { id: string; establishment_id: string; order_ref: string; supplier: string; supplier_email: string | null; requested_delivery_date: string | null; status: 'draft' | 'sent' | 'received' | 'partial'; total_ht: number; notes: string | null; created_by: string | null; created_at: string }
        Insert: { id?: string; establishment_id: string; order_ref: string; supplier: string; supplier_email?: string | null; requested_delivery_date?: string | null; status?: 'draft' | 'sent' | 'received' | 'partial'; total_ht?: number; notes?: string | null; created_by?: string | null; created_at?: string }
        Update: { id?: string; establishment_id?: string; order_ref?: string; supplier?: string; supplier_email?: string | null; requested_delivery_date?: string | null; status?: 'draft' | 'sent' | 'received' | 'partial'; total_ht?: number; notes?: string | null; created_by?: string | null; created_at?: string }
        Relationships: [
          { foreignKeyName: "purchase_orders_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] }
        ]
      }
      purchase_order_items: {
        Row: { id: string; purchase_order_id: string; stock_item_id: string; quantity_ordered: number; unit_price: number; quantity_received: number | null; sort_order: number }
        Insert: { id?: string; purchase_order_id: string; stock_item_id: string; quantity_ordered: number; unit_price: number; quantity_received?: number | null; sort_order?: number }
        Update: { id?: string; purchase_order_id?: string; stock_item_id?: string; quantity_ordered?: number; unit_price?: number; quantity_received?: number | null; sort_order?: number }
        Relationships: [
          { foreignKeyName: "purchase_order_items_purchase_order_id_fkey"; columns: ["purchase_order_id"]; isOneToOne: false; referencedRelation: "purchase_orders"; referencedColumns: ["id"] },
          { foreignKeyName: "purchase_order_items_stock_item_id_fkey"; columns: ["stock_item_id"]; isOneToOne: false; referencedRelation: "stock_items"; referencedColumns: ["id"] }
        ]
      }
      recipes: {
        Row: { id: string; establishment_id: string; title: string; content: string | null; media_urls: string[]; version: number; is_internal: boolean; category: string | null; description: string | null; portion: string | null; active: boolean; created_at: string }
        Insert: { id?: string; establishment_id: string; title: string; content?: string | null; media_urls?: string[]; version?: number; is_internal?: boolean; category?: string | null; description?: string | null; portion?: string | null; active?: boolean; created_at?: string }
        Update: { id?: string; establishment_id?: string; title?: string; content?: string | null; media_urls?: string[]; version?: number; is_internal?: boolean; category?: string | null; description?: string | null; portion?: string | null; active?: boolean; created_at?: string }
        Relationships: [
          { foreignKeyName: "recipes_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] }
        ]
      }
      recipe_ingredients: {
        Row: { id: string; recipe_id: string; name: string; quantity: number; unit: string; unit_cost: number; sort_order: number }
        Insert: { id?: string; recipe_id: string; name: string; quantity: number; unit: string; unit_cost?: number; sort_order?: number }
        Update: { id?: string; recipe_id?: string; name?: string; quantity?: number; unit?: string; unit_cost?: number; sort_order?: number }
        Relationships: [
          { foreignKeyName: "recipe_ingredients_recipe_id_fkey"; columns: ["recipe_id"]; isOneToOne: false; referencedRelation: "recipes"; referencedColumns: ["id"] }
        ]
      }
      sop_categories: {
        Row: { id: string; establishment_id: string; name: string; emoji: string | null; sort_order: number }
        Insert: { id?: string; establishment_id: string; name: string; emoji?: string | null; sort_order?: number }
        Update: { id?: string; establishment_id?: string; name?: string; emoji?: string | null; sort_order?: number }
        Relationships: [
          { foreignKeyName: "sop_categories_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] }
        ]
      }
      sops: {
        Row: { id: string; establishment_id: string; title: string; content: string | null; media_urls: string[]; version: number; category_id: string | null; recipe_id: string | null; active: boolean }
        Insert: { id?: string; establishment_id: string; title: string; content?: string | null; media_urls?: string[]; version?: number; category_id?: string | null; recipe_id?: string | null; active?: boolean }
        Update: { id?: string; establishment_id?: string; title?: string; content?: string | null; media_urls?: string[]; version?: number; category_id?: string | null; recipe_id?: string | null; active?: boolean }
        Relationships: [
          { foreignKeyName: "sops_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] },
          { foreignKeyName: "sops_category_id_fkey"; columns: ["category_id"]; isOneToOne: false; referencedRelation: "sop_categories"; referencedColumns: ["id"] },
          { foreignKeyName: "sops_recipe_id_fkey"; columns: ["recipe_id"]; isOneToOne: false; referencedRelation: "recipes"; referencedColumns: ["id"] }
        ]
      }
      sop_steps: {
        Row: { id: string; sop_id: string; sort_order: number; title: string; description: string; duration_seconds: number | null; media_url: string | null; note_type: 'warning' | 'tip' | null; note_text: string | null }
        Insert: { id?: string; sop_id: string; sort_order?: number; title: string; description?: string; duration_seconds?: number | null; media_url?: string | null; note_type?: 'warning' | 'tip' | null; note_text?: string | null }
        Update: { id?: string; sop_id?: string; sort_order?: number; title?: string; description?: string; duration_seconds?: number | null; media_url?: string | null; note_type?: 'warning' | 'tip' | null; note_text?: string | null }
        Relationships: [
          { foreignKeyName: "sop_steps_sop_id_fkey"; columns: ["sop_id"]; isOneToOne: false; referencedRelation: "sops"; referencedColumns: ["id"] }
        ]
      }
      customers: {
        Row: { id: string; establishment_id: string; first_name: string; last_name: string | null; name: string; phone: string | null; email: string | null; points: number; tier: 'standard' | 'silver' | 'gold'; created_by: string | null; network_customer_id: string | null }
        Insert: { id?: string; establishment_id: string; first_name?: string; last_name?: string | null; name?: string; phone?: string | null; email?: string | null; points?: number; tier?: 'standard' | 'silver' | 'gold'; created_by?: string | null; network_customer_id?: string | null }
        Update: { id?: string; establishment_id?: string; first_name?: string; last_name?: string | null; name?: string; phone?: string | null; email?: string | null; points?: number; tier?: 'standard' | 'silver' | 'gold'; created_by?: string | null; network_customer_id?: string | null }
        Relationships: [
          { foreignKeyName: "customers_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] },
          { foreignKeyName: "customers_network_customer_id_fkey"; columns: ["network_customer_id"]; isOneToOne: false; referencedRelation: "network_customers"; referencedColumns: ["id"] }
        ]
      }
      loyalty_rewards: {
        Row: { id: string; establishment_id: string; name: string; points_required: number; type: string; value: number; level_required: string; active: boolean }
        Insert: { id?: string; establishment_id: string; name: string; points_required: number; type: string; value?: number; level_required?: string; active?: boolean }
        Update: { id?: string; establishment_id?: string; name?: string; points_required?: number; type?: string; value?: number; level_required?: string; active?: boolean }
        Relationships: [
          { foreignKeyName: "loyalty_rewards_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] }
        ]
      }
      loyalty_config: {
        Row: { id: string; establishment_id: string; active: boolean; pts_per_euro: number; signup_bonus: number; pts_validity_days: number; min_redemption_pts: number; levels: Json; created_at: string; updated_at: string }
        Insert: { id?: string; establishment_id: string; active?: boolean; pts_per_euro?: number; signup_bonus?: number; pts_validity_days?: number; min_redemption_pts?: number; levels?: Json; created_at?: string; updated_at?: string }
        Update: { id?: string; establishment_id?: string; active?: boolean; pts_per_euro?: number; signup_bonus?: number; pts_validity_days?: number; min_redemption_pts?: number; levels?: Json; created_at?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "loyalty_config_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: true; referencedRelation: "establishments"; referencedColumns: ["id"] }
        ]
      }
      loyalty_transactions: {
        Row: { id: string; customer_id: string; order_id: string | null; points: number; type: 'earn' | 'redeem'; created_at: string }
        Insert: { id?: string; customer_id: string; order_id?: string | null; points: number; type: 'earn' | 'redeem'; created_at?: string }
        Update: { id?: string; customer_id?: string; order_id?: string | null; points?: number; type?: 'earn' | 'redeem'; created_at?: string }
        Relationships: [
          { foreignKeyName: "loyalty_transactions_customer_id_fkey"; columns: ["customer_id"]; isOneToOne: false; referencedRelation: "customers"; referencedColumns: ["id"] },
          { foreignKeyName: "loyalty_transactions_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] }
        ]
      }
      fiscal_journal_entries: {
        Row: { id: string; establishment_id: string; sequence_no: number; event_type: 'sale' | 'void' | 'refund' | 'z_close'; order_id: string | null; amount_ttc: number; cashier_id: string | null; occurred_at: string; previous_hash: string; entry_hash: string; meta: Json | null }
        Insert: { id?: string; establishment_id: string; sequence_no: number; event_type: 'sale' | 'void' | 'refund' | 'z_close'; order_id?: string | null; amount_ttc?: number; cashier_id?: string | null; occurred_at?: string; previous_hash?: string; entry_hash: string; meta?: Json | null }
        Update: { id?: string; establishment_id?: string; sequence_no?: number; event_type?: 'sale' | 'void' | 'refund' | 'z_close'; order_id?: string | null; amount_ttc?: number; cashier_id?: string | null; occurred_at?: string; previous_hash?: string; entry_hash?: string; meta?: Json | null }
        Relationships: [
          { foreignKeyName: "fiscal_journal_entries_establishment_id_fkey"; columns: ["establishment_id"]; isOneToOne: false; referencedRelation: "establishments"; referencedColumns: ["id"] },
          { foreignKeyName: "fiscal_journal_entries_order_id_fkey"; columns: ["order_id"]; isOneToOne: false; referencedRelation: "orders"; referencedColumns: ["id"] }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_role: 'super_admin' | 'admin' | 'caissier' | 'franchise_admin'
      product_category: 'entree' | 'plat' | 'dessert' | 'boisson' | 'autre'
    }
  }
}
