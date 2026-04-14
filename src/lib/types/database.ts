export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      automation_rules: {
        Row: {
          active: boolean
          channel: string
          created_at: string
          delay_hours: number
          establishment_id: string
          id: string
          template_body: string
          trigger_type: string
        }
        Insert: {
          active?: boolean
          channel: string
          created_at?: string
          delay_hours?: number
          establishment_id: string
          id?: string
          template_body: string
          trigger_type: string
        }
        Update: {
          active?: boolean
          channel?: string
          created_at?: string
          delay_hours?: number
          establishment_id?: string
          id?: string
          template_body?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sends: {
        Row: {
          brevo_message_id: string | null
          campaign_id: string | null
          channel: string
          customer_id: string
          id: string
          sent_at: string
          status: string
          trigger_type: string | null
        }
        Insert: {
          brevo_message_id?: string | null
          campaign_id?: string | null
          channel: string
          customer_id: string
          id?: string
          sent_at?: string
          status?: string
          trigger_type?: string | null
        }
        Update: {
          brevo_message_id?: string | null
          campaign_id?: string | null
          channel?: string
          customer_id?: string
          id?: string
          sent_at?: string
          status?: string
          trigger_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sends_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          channel: string
          created_at: string
          delivered_count: number
          establishment_id: string
          id: string
          name: string
          scheduled_at: string | null
          segment_filter: Json
          sent_at: string | null
          sent_count: number
          status: string
          template_body: string
          trigger: string | null
          type: string
        }
        Insert: {
          channel: string
          created_at?: string
          delivered_count?: number
          establishment_id: string
          id?: string
          name: string
          scheduled_at?: string | null
          segment_filter?: Json
          sent_at?: string | null
          sent_count?: number
          status?: string
          template_body: string
          trigger?: string | null
          type: string
        }
        Update: {
          channel?: string
          created_at?: string
          delivered_count?: number
          establishment_id?: string
          id?: string
          name?: string
          scheduled_at?: string | null
          segment_filter?: Json
          sent_at?: string | null
          sent_count?: number
          status?: string
          template_body?: string
          trigger?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_float: number | null
          establishment_id: string
          id: string
          opened_at: string
          opened_by: string
          opening_float: number
          status: string
          total_card: number | null
          total_cash: number | null
          total_sales: number | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_float?: number | null
          establishment_id: string
          id?: string
          opened_at?: string
          opened_by: string
          opening_float?: number
          status?: string
          total_card?: number | null
          total_cash?: number | null
          total_sales?: number | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_float?: number | null
          establishment_id?: string
          id?: string
          opened_at?: string
          opened_by?: string
          opening_float?: number
          status?: string
          total_card?: number | null
          total_cash?: number | null
          total_sales?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color_hex: string
          created_at: string
          establishment_id: string
          icon: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color_hex?: string
          created_at?: string
          establishment_id: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color_hex?: string
          created_at?: string
          establishment_id?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          avg_basket: number
          birthdate: string | null
          brevo_contact_id: number | null
          created_by: string | null
          email: string | null
          establishment_id: string
          first_name: string
          gender: string | null
          id: string
          last_name: string | null
          last_order_at: string | null
          name: string
          network_customer_id: string | null
          notes: string | null
          opt_in_at: string | null
          opt_in_email: boolean
          opt_in_sms: boolean
          opt_in_whatsapp: boolean
          order_count: number
          phone: string | null
          points: number
          rfm_segment: string
          rfm_updated_at: string | null
          tags: string[]
          tier: string
        }
        Insert: {
          avg_basket?: number
          birthdate?: string | null
          brevo_contact_id?: number | null
          created_by?: string | null
          email?: string | null
          establishment_id: string
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string | null
          last_order_at?: string | null
          name: string
          network_customer_id?: string | null
          notes?: string | null
          opt_in_at?: string | null
          opt_in_email?: boolean
          opt_in_sms?: boolean
          opt_in_whatsapp?: boolean
          order_count?: number
          phone?: string | null
          points?: number
          rfm_segment?: string
          rfm_updated_at?: string | null
          tags?: string[]
          tier?: string
        }
        Update: {
          avg_basket?: number
          birthdate?: string | null
          brevo_contact_id?: number | null
          created_by?: string | null
          email?: string | null
          establishment_id?: string
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string | null
          last_order_at?: string | null
          name?: string
          network_customer_id?: string | null
          notes?: string | null
          opt_in_at?: string | null
          opt_in_email?: boolean
          opt_in_sms?: boolean
          opt_in_whatsapp?: boolean
          order_count?: number
          phone?: string | null
          points?: number
          rfm_segment?: string
          rfm_updated_at?: string | null
          tags?: string[]
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_network_customer_id_fkey"
            columns: ["network_customer_id"]
            isOneToOne: false
            referencedRelation: "network_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_catalog_items: {
        Row: {
          catalog_item_id: string
          created_at: string
          current_version: number
          establishment_id: string
          id: string
          is_active: boolean
          local_price: number | null
          local_stock_threshold: number | null
          notified_at: string | null
          seen_at: string | null
        }
        Insert: {
          catalog_item_id: string
          created_at?: string
          current_version?: number
          establishment_id: string
          id?: string
          is_active?: boolean
          local_price?: number | null
          local_stock_threshold?: number | null
          notified_at?: string | null
          seen_at?: string | null
        }
        Update: {
          catalog_item_id?: string
          created_at?: string
          current_version?: number
          establishment_id?: string
          id?: string
          is_active?: boolean
          local_price?: number | null
          local_stock_threshold?: number | null
          notified_at?: string | null
          seen_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "establishment_catalog_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "network_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_catalog_items_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      establishments: {
        Row: {
          address: string | null
          auto_print_receipt: boolean
          brevo_sender_name: string | null
          created_at: string
          default_opening_float: number
          default_tva_rate: number
          google_review_url: string | null
          id: string
          name: string
          org_id: string
          receipt_footer: string
          siret: string | null
          sms_credits: number
          sms_used_total: number
          timezone: string
        }
        Insert: {
          address?: string | null
          auto_print_receipt?: boolean
          brevo_sender_name?: string | null
          created_at?: string
          default_opening_float?: number
          default_tva_rate?: number
          google_review_url?: string | null
          id?: string
          name: string
          org_id: string
          receipt_footer?: string
          siret?: string | null
          sms_credits?: number
          sms_used_total?: number
          timezone?: string
        }
        Update: {
          address?: string | null
          auto_print_receipt?: boolean
          brevo_sender_name?: string | null
          created_at?: string
          default_opening_float?: number
          default_tva_rate?: number
          google_review_url?: string | null
          id?: string
          name?: string
          org_id?: string
          receipt_footer?: string
          siret?: string | null
          sms_credits?: number
          sms_used_total?: number
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_journal_entries: {
        Row: {
          amount_ttc: number
          cashier_id: string | null
          entry_hash: string
          establishment_id: string
          event_type: string
          id: string
          meta: Json | null
          occurred_at: string
          order_id: string | null
          previous_hash: string
          sequence_no: number
        }
        Insert: {
          amount_ttc?: number
          cashier_id?: string | null
          entry_hash: string
          establishment_id: string
          event_type: string
          id?: string
          meta?: Json | null
          occurred_at?: string
          order_id?: string | null
          previous_hash?: string
          sequence_no: number
        }
        Update: {
          amount_ttc?: number
          cashier_id?: string | null
          entry_hash?: string
          establishment_id?: string
          event_type?: string
          id?: string
          meta?: Json | null
          occurred_at?: string
          order_id?: string | null
          previous_hash?: string
          sequence_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_journal_entries_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_journal_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      franchise_contracts: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          marketing_rate: number
          org_id: string
          royalty_rate: number
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          marketing_rate?: number
          org_id: string
          royalty_rate?: number
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          marketing_rate?: number
          org_id?: string
          royalty_rate?: number
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "franchise_contracts_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "franchise_contracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          company_name: string
          created_at: string
          delivery_email: string | null
          establishment_id: string
          id: string
          invoice_year: number
          number: string
          order_id: string
          pdf_url: string | null
          sequence_number: number
          siret: string | null
        }
        Insert: {
          company_name: string
          created_at?: string
          delivery_email?: string | null
          establishment_id: string
          id?: string
          invoice_year: number
          number?: string
          order_id: string
          pdf_url?: string | null
          sequence_number: number
          siret?: string | null
        }
        Update: {
          company_name?: string
          created_at?: string
          delivery_email?: string | null
          establishment_id?: string
          id?: string
          invoice_year?: number
          number?: string
          order_id?: string
          pdf_url?: string | null
          sequence_number?: number
          siret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_config: {
        Row: {
          active: boolean
          created_at: string
          establishment_id: string
          id: string
          levels: Json
          min_redemption_pts: number
          pts_per_euro: number
          pts_validity_days: number
          signup_bonus: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          establishment_id: string
          id?: string
          levels?: Json
          min_redemption_pts?: number
          pts_per_euro?: number
          pts_validity_days?: number
          signup_bonus?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          establishment_id?: string
          id?: string
          levels?: Json
          min_redemption_pts?: number
          pts_per_euro?: number
          pts_validity_days?: number
          signup_bonus?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_config_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: true
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          active: boolean
          establishment_id: string
          id: string
          level_required: string
          name: string
          points_required: number
          type: string
          value: number
        }
        Insert: {
          active?: boolean
          establishment_id: string
          id?: string
          level_required?: string
          name: string
          points_required: number
          type: string
          value?: number
        }
        Update: {
          active?: boolean
          establishment_id?: string
          id?: string
          level_required?: string
          name?: string
          points_required?: number
          type?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          order_id: string | null
          points: number
          type: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          order_id?: string | null
          points: number
          type: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          order_id?: string | null
          points?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      network_catalog_item_data: {
        Row: {
          catalog_item_id: string
          id: string
          payload: Json
          previous_payload: Json | null
        }
        Insert: {
          catalog_item_id: string
          id?: string
          payload?: Json
          previous_payload?: Json | null
        }
        Update: {
          catalog_item_id?: string
          id?: string
          payload?: Json
          previous_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "network_catalog_item_data_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: true
            referencedRelation: "network_catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      network_catalog_items: {
        Row: {
          available_from: string | null
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          is_mandatory: boolean
          is_seasonal: boolean
          name: string
          org_id: string
          status: string
          type: string
          updated_at: string
          version: number
        }
        Insert: {
          available_from?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_mandatory?: boolean
          is_seasonal?: boolean
          name: string
          org_id: string
          status?: string
          type: string
          updated_at?: string
          version?: number
        }
        Update: {
          available_from?: string | null
          created_at?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          is_mandatory?: boolean
          is_seasonal?: boolean
          name?: string
          org_id?: string
          status?: string
          type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "network_catalog_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      network_customers: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          org_id: string
          phone: string
          tier: string
          total_points: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          org_id: string
          phone: string
          tier?: string
          total_points?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          org_id?: string
          phone?: string
          tier?: string
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      network_loyalty_config: {
        Row: {
          active: boolean
          created_at: string
          id: string
          levels: Json
          min_redemption_pts: number
          org_id: string
          pts_per_euro: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          levels?: Json
          min_redemption_pts?: number
          org_id: string
          pts_per_euro?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          levels?: Json
          min_redemption_pts?: number
          org_id?: string
          pts_per_euro?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_loyalty_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          discount_pct: number | null
          emoji: string | null
          id: string
          line_total: number
          note: string | null
          order_id: string
          product_id: string
          product_name: string
          quantity: number
          tva_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount_pct?: number | null
          emoji?: string | null
          id?: string
          line_total: number
          note?: string | null
          order_id: string
          product_id: string
          product_name: string
          quantity?: number
          tva_rate: number
          unit_price: number
        }
        Update: {
          created_at?: string
          discount_pct?: number | null
          emoji?: string | null
          id?: string
          line_total?: number
          note?: string | null
          order_id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          tva_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cashier_id: string
          created_at: string
          customer_id: string | null
          discount_amount: number
          discount_type: string | null
          discount_value: number | null
          establishment_id: string
          id: string
          note: string | null
          reward_discount_amount: number
          reward_id: string | null
          session_id: string | null
          status: string
          subtotal_ht: number
          table_id: string | null
          tax_10: number
          tax_20: number
          tax_5_5: number
          total_ttc: number
          updated_at: string
        }
        Insert: {
          cashier_id: string
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          discount_type?: string | null
          discount_value?: number | null
          establishment_id: string
          id?: string
          note?: string | null
          reward_discount_amount?: number
          reward_id?: string | null
          session_id?: string | null
          status?: string
          subtotal_ht?: number
          table_id?: string | null
          tax_10?: number
          tax_20?: number
          tax_5_5?: number
          total_ttc?: number
          updated_at?: string
        }
        Update: {
          cashier_id?: string
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          discount_type?: string | null
          discount_value?: number | null
          establishment_id?: string
          id?: string
          note?: string | null
          reward_discount_amount?: number
          reward_id?: string | null
          session_id?: string | null
          status?: string
          subtotal_ht?: number
          table_id?: string | null
          tax_10?: number
          tax_20?: number
          tax_5_5?: number
          total_ttc?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_org_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_org_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_org_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_parent_org_id_fkey"
            columns: ["parent_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          cash_given: number | null
          change_due: number | null
          created_at: string
          id: string
          method: string
          order_id: string
          tpe_ref: string | null
        }
        Insert: {
          amount: number
          cash_given?: number | null
          change_due?: number | null
          created_at?: string
          id?: string
          method: string
          order_id: string
          tpe_ref?: string | null
        }
        Update: {
          amount?: number
          cash_given?: number | null
          change_due?: number | null
          created_at?: string
          id?: string
          method?: string
          order_id?: string
          tpe_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          emoji: string | null
          establishment_id: string
          id: string
          is_active: boolean
          name: string
          price: number
          recipe_id: string | null
          sort_order: number | null
          tva_rate: number
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          emoji?: string | null
          establishment_id: string
          id?: string
          is_active?: boolean
          name: string
          price: number
          recipe_id?: string | null
          sort_order?: number | null
          tva_rate: number
        }
        Update: {
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          emoji?: string | null
          establishment_id?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          recipe_id?: string | null
          sort_order?: number | null
          tva_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          establishment_id: string | null
          first_name: string
          id: string
          org_id: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          establishment_id?: string | null
          first_name?: string
          id: string
          org_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          establishment_id?: string | null
          first_name?: string
          id?: string
          org_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          id: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received: number | null
          sort_order: number
          stock_item_id: string
          unit_price: number
        }
        Insert: {
          id?: string
          purchase_order_id: string
          quantity_ordered: number
          quantity_received?: number | null
          sort_order?: number
          stock_item_id: string
          unit_price: number
        }
        Update: {
          id?: string
          purchase_order_id?: string
          quantity_ordered?: number
          quantity_received?: number | null
          sort_order?: number
          stock_item_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_receptions: {
        Row: {
          id: string
          lines: Json
          notes: string | null
          purchase_order_id: string
          received_at: string
        }
        Insert: {
          id?: string
          lines?: Json
          notes?: string | null
          purchase_order_id: string
          received_at?: string
        }
        Update: {
          id?: string
          lines?: Json
          notes?: string | null
          purchase_order_id?: string
          received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_receptions_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          created_by: string | null
          establishment_id: string
          id: string
          notes: string | null
          order_ref: string
          requested_delivery_date: string | null
          status: string
          supplier: string
          supplier_email: string | null
          total_ht: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          establishment_id: string
          id?: string
          notes?: string | null
          order_ref: string
          requested_delivery_date?: string | null
          status?: string
          supplier: string
          supplier_email?: string | null
          total_ht?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          establishment_id?: string
          id?: string
          notes?: string | null
          order_ref?: string
          requested_delivery_date?: string | null
          status?: string
          supplier?: string
          supplier_email?: string | null
          total_ht?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          id: string
          name: string
          quantity: number
          recipe_id: string
          sort_order: number
          unit: string
          unit_cost: number
        }
        Insert: {
          id?: string
          name: string
          quantity: number
          recipe_id: string
          sort_order?: number
          unit: string
          unit_cost?: number
        }
        Update: {
          id?: string
          name?: string
          quantity?: number
          recipe_id?: string
          sort_order?: number
          unit?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          active: boolean
          category: string | null
          content: string | null
          created_at: string
          description: string | null
          establishment_id: string
          id: string
          is_internal: boolean
          media_urls: string[] | null
          portion: string | null
          title: string
          version: number
        }
        Insert: {
          active?: boolean
          category?: string | null
          content?: string | null
          created_at?: string
          description?: string | null
          establishment_id: string
          id?: string
          is_internal?: boolean
          media_urls?: string[] | null
          portion?: string | null
          title: string
          version?: number
        }
        Update: {
          active?: boolean
          category?: string | null
          content?: string | null
          created_at?: string
          description?: string | null
          establishment_id?: string
          id?: string
          is_internal?: boolean
          media_urls?: string[] | null
          portion?: string | null
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipes_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          current_order_id: string | null
          establishment_id: string
          id: string
          name: string
          room_id: string | null
          seats: number
          status: string
          x_pos: number
          y_pos: number
        }
        Insert: {
          current_order_id?: string | null
          establishment_id: string
          id?: string
          name: string
          room_id?: string | null
          seats?: number
          status?: string
          x_pos?: number
          y_pos?: number
        }
        Update: {
          current_order_id?: string | null
          establishment_id?: string
          id?: string
          name?: string
          room_id?: string | null
          seats?: number
          status?: string
          x_pos?: number
          y_pos?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_table_current_order"
            columns: ["current_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          establishment_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          establishment_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          establishment_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "rooms_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_categories: {
        Row: {
          emoji: string | null
          establishment_id: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          emoji?: string | null
          establishment_id: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          emoji?: string | null
          establishment_id?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "sop_categories_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_completions: {
        Row: {
          catalog_item_id: string
          completed_at: string
          establishment_id: string
          id: string
          user_id: string
        }
        Insert: {
          catalog_item_id: string
          completed_at?: string
          establishment_id: string
          id?: string
          user_id: string
        }
        Update: {
          catalog_item_id?: string
          completed_at?: string
          establishment_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_completions_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "network_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_completions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_steps: {
        Row: {
          description: string
          duration_seconds: number | null
          id: string
          media_url: string | null
          note_text: string | null
          note_type: string | null
          sop_id: string
          sort_order: number
          title: string
        }
        Insert: {
          description?: string
          duration_seconds?: number | null
          id?: string
          media_url?: string | null
          note_text?: string | null
          note_type?: string | null
          sop_id: string
          sort_order?: number
          title: string
        }
        Update: {
          description?: string
          duration_seconds?: number | null
          id?: string
          media_url?: string | null
          note_text?: string | null
          note_type?: string | null
          sop_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_steps_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sops"
            referencedColumns: ["id"]
          },
        ]
      }
      sops: {
        Row: {
          active: boolean
          category_id: string | null
          content: string | null
          establishment_id: string
          id: string
          media_urls: string[] | null
          recipe_id: string | null
          title: string
          version: number
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          content?: string | null
          establishment_id: string
          id?: string
          media_urls?: string[] | null
          recipe_id?: string | null
          title: string
          version?: number
        }
        Update: {
          active?: boolean
          category_id?: string | null
          content?: string | null
          establishment_id?: string
          id?: string
          media_urls?: string[] | null
          recipe_id?: string | null
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sops_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "sop_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sops_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sops_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          active: boolean
          alert_threshold: number
          category: string | null
          establishment_id: string
          id: string
          is_pos: boolean
          name: string
          order_quantity: number
          pos_category_id: string | null
          pos_price: number | null
          pos_tva_rate: number
          product_id: string | null
          purchase_price: number
          purchase_qty: number
          quantity: number
          supplier: string | null
          supplier_ref: string | null
          unit: string
          unit_price: number
        }
        Insert: {
          active?: boolean
          alert_threshold?: number
          category?: string | null
          establishment_id: string
          id?: string
          is_pos?: boolean
          name: string
          order_quantity?: number
          pos_category_id?: string | null
          pos_price?: number | null
          pos_tva_rate?: number
          product_id?: string | null
          purchase_price?: number
          purchase_qty?: number
          quantity?: number
          supplier?: string | null
          supplier_ref?: string | null
          unit: string
          unit_price?: number
        }
        Update: {
          active?: boolean
          alert_threshold?: number
          category?: string | null
          establishment_id?: string
          id?: string
          is_pos?: boolean
          name?: string
          order_quantity?: number
          pos_category_id?: string | null
          pos_price?: number | null
          pos_tva_rate?: number
          product_id?: string | null
          purchase_price?: number
          purchase_qty?: number
          quantity?: number
          supplier?: string | null
          supplier_ref?: string | null
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_pos_category_id_fkey"
            columns: ["pos_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_crm_persona: {
        Row: {
          a_risque_count: number | null
          age_18_25: number | null
          age_26_35: number | null
          age_36_45: number | null
          age_46_55: number | null
          age_55_plus: number | null
          avg_age: number | null
          avg_basket: number | null
          avg_basket_men: number | null
          avg_basket_women: number | null
          establishment_id: string | null
          fidele_count: number | null
          freq_high: number | null
          freq_low: number | null
          freq_mid: number | null
          men_count: number | null
          nouveau_count: number | null
          other_count: number | null
          perdu_count: number | null
          total: number | null
          unknown_count: number | null
          vip_count: number | null
          women_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      v_daily_ca: {
        Row: {
          ca_ht: number | null
          ca_ttc: number | null
          day: string | null
          establishment_id: string | null
          tva_total: number | null
          tx_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      v_hourly_tx: {
        Row: {
          establishment_id: string | null
          hour: number | null
          tx_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      v_top_products: {
        Row: {
          ca_ttc: number | null
          establishment_id: string | null
          product_id: string | null
          product_name: string | null
          qty_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tva_breakdown: {
        Row: {
          base_ht: number | null
          day: string | null
          establishment_id: string | null
          tva_amount: number | null
          tva_rate: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      deduct_sms_credit: {
        Args: { p_establishment_id: string }
        Returns: undefined
      }
      get_my_profile_role: { Args: never; Returns: string }
      increment_campaign_delivered: {
        Args: { p_campaign_id: string }
        Returns: undefined
      }
      insert_invoice_atomic: {
        Args: {
          p_company_name: string
          p_delivery_email: string
          p_establishment_id: string
          p_order_id: string
          p_pdf_url: string
          p_siret: string
          p_year: number
        }
        Returns: {
          invoice_id: string
          invoice_number: string
        }[]
      }
    }
    Enums: {
      product_category: "entree" | "plat" | "dessert" | "boisson" | "autre"
      user_role: "super_admin" | "admin" | "caissier" | "franchise_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      product_category: ["entree", "plat", "dessert", "boisson", "autre"],
      user_role: ["super_admin", "admin", "caissier", "franchise_admin"],
    },
  },
} as const
