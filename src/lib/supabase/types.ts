export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      api_rate_limits: {
        Row: {
          request_count: number
          scope: string
          subject_hash: string
          window_started_at: string
        }
        Insert: {
          request_count?: number
          scope: string
          subject_hash: string
          window_started_at: string
        }
        Update: {
          request_count?: number
          scope?: string
          subject_hash?: string
          window_started_at?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          config: Json
          created_at: string
          ends_at: string
          id: string
          is_active: boolean
          name: string
          starts_at: string
          type: string
        }
        Insert: {
          config?: Json
          created_at?: string
          ends_at: string
          id?: string
          is_active?: boolean
          name: string
          starts_at?: string
          type: string
        }
        Update: {
          config?: Json
          created_at?: string
          ends_at?: string
          id?: string
          is_active?: boolean
          name?: string
          starts_at?: string
          type?: string
        }
        Relationships: []
      }
      checkout_quotes: {
        Row: {
          amount_paise: number
          consumed_at: string | null
          created_at: string
          currency: string
          expires_at: string
          id: string
          items_payload: Json
          loyalty_points: number
          nth_order_discount: number
          order_payload: Json
          user_id: string
          wallet_amount: number
        }
        Insert: {
          amount_paise: number
          consumed_at?: string | null
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          items_payload: Json
          loyalty_points?: number
          nth_order_discount?: number
          order_payload: Json
          user_id: string
          wallet_amount?: number
        }
        Update: {
          amount_paise?: number
          consumed_at?: string | null
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          items_payload?: Json
          loyalty_points?: number
          nth_order_discount?: number
          order_payload?: Json
          user_id?: string
          wallet_amount?: number
        }
        Relationships: []
      }
      coupon_audit_logs: {
        Row: {
          action: string
          admin_id: string
          admin_name: string | null
          coupon_id: string | null
          created_at: string
          id: string
          new_value: Json | null
          previous_value: Json | null
        }
        Insert: {
          action: string
          admin_id: string
          admin_name?: string | null
          coupon_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
        }
        Update: {
          action?: string
          admin_id?: string
          admin_name?: string | null
          coupon_id?: string | null
          created_at?: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_audit_logs_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_campaigns: {
        Row: {
          banner_url: string | null
          created_at: string
          description: string | null
          ends_at: string
          id: string
          name: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          ends_at: string
          id?: string
          name: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string
          id?: string
          name?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      coupon_outlet_restrictions: {
        Row: {
          coupon_id: string
          created_at: string
          id: string
          outlet_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          id?: string
          outlet_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          id?: string
          outlet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_outlet_restrictions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_outlet_restrictions_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_usage: {
        Row: {
          coupon_id: string
          created_at: string
          discount_amount: number
          id: string
          order_id: string
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_amount: number
          id?: string
          order_id: string
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_amount?: number
          id?: string
          order_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usage_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applicable_category_ids: string[] | null
          applicable_product_ids: string[] | null
          applicable_type: string | null
          buy_x_qty: number | null
          campaign_id: string | null
          code: string
          created_at: string
          customer_eligibility: string | null
          daily_limit: number | null
          description: string
          discount_type: string
          discount_type_ext: string | null
          discount_value: number
          ends_at: string
          free_product_id: string | null
          get_y_qty: number | null
          id: string
          is_active: boolean
          max_discount: number | null
          min_cart_value: number | null
          min_order: number
          name: string | null
          per_user_limit: number | null
          priority: number | null
          starts_at: string
          status: string
          updated_at: string | null
          usage_limit: number | null
          used_count: number
        }
        Insert: {
          applicable_category_ids?: string[] | null
          applicable_product_ids?: string[] | null
          applicable_type?: string | null
          buy_x_qty?: number | null
          campaign_id?: string | null
          code: string
          created_at?: string
          customer_eligibility?: string | null
          daily_limit?: number | null
          description: string
          discount_type: string
          discount_type_ext?: string | null
          discount_value: number
          ends_at: string
          free_product_id?: string | null
          get_y_qty?: number | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_cart_value?: number | null
          min_order?: number
          name?: string | null
          per_user_limit?: number | null
          priority?: number | null
          starts_at?: string
          status?: string
          updated_at?: string | null
          usage_limit?: number | null
          used_count?: number
        }
        Update: {
          applicable_category_ids?: string[] | null
          applicable_product_ids?: string[] | null
          applicable_type?: string | null
          buy_x_qty?: number | null
          campaign_id?: string | null
          code?: string
          created_at?: string
          customer_eligibility?: string | null
          daily_limit?: number | null
          description?: string
          discount_type?: string
          discount_type_ext?: string | null
          discount_value?: number
          ends_at?: string
          free_product_id?: string | null
          get_y_qty?: number | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          min_cart_value?: number | null
          min_order?: number
          name?: string | null
          per_user_limit?: number | null
          priority?: number | null
          starts_at?: string
          status?: string
          updated_at?: string | null
          usage_limit?: number | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "coupon_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_line_1: string
          address_line_2: string | null
          city: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          landmark: string | null
          phone: string
          pincode: string
          recipient_name: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line_1: string
          address_line_2?: string | null
          city: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          landmark?: string | null
          phone: string
          pincode: string
          recipient_name: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line_1?: string
          address_line_2?: string | null
          city?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          landmark?: string | null
          phone?: string
          pincode?: string
          recipient_name?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customization_options: {
        Row: {
          group_id: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          group_id: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          price?: number
          sort_order?: number
        }
        Update: {
          group_id?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "customization_options_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "item_customization_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          created_at: string | null
          customer_id: string
          full_name: string
          id: string
          is_default: boolean | null
          label: string | null
          phone: string
          pincode: string
          state: string
          updated_at: string | null
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          created_at?: string | null
          customer_id: string
          full_name: string
          id?: string
          is_default?: boolean | null
          label?: string | null
          phone: string
          pincode: string
          state: string
          updated_at?: string | null
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          created_at?: string | null
          customer_id?: string
          full_name?: string
          id?: string
          is_default?: boolean | null
          label?: string | null
          phone?: string
          pincode?: string
          state?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "ec_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_admin_users: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean | null
          role?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ec_banners: {
        Row: {
          bg_color: string | null
          created_at: string | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_text: string | null
          link_url: string | null
          position: string
          sort_order: number | null
          starts_at: string | null
          subtitle: string | null
          text_color: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          bg_color?: string | null
          created_at?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_text?: string | null
          link_url?: string | null
          position?: string
          sort_order?: number | null
          starts_at?: string | null
          subtitle?: string | null
          text_color?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          bg_color?: string | null
          created_at?: string | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_text?: string | null
          link_url?: string | null
          position?: string
          sort_order?: number | null
          starts_at?: string | null
          subtitle?: string | null
          text_color?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ec_cart_items: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          product_id: string
          quantity: number
          updated_at: string | null
          variant_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string | null
          variant_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_cart_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "ec_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ec_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ec_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          meta_description: string | null
          meta_title: string | null
          name: string
          parent_id: string | null
          show_on_homepage: boolean | null
          slug: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          name: string
          parent_id?: string | null
          show_on_homepage?: boolean | null
          slug: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          parent_id?: string | null
          show_on_homepage?: boolean | null
          slug?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ec_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_coupon_usage: {
        Row: {
          coupon_id: string
          customer_id: string
          id: string
          order_id: string | null
          used_at: string | null
        }
        Insert: {
          coupon_id: string
          customer_id: string
          id?: string
          order_id?: string | null
          used_at?: string | null
        }
        Update: {
          coupon_id?: string
          customer_id?: string
          id?: string
          order_id?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_coupon_usage_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "ec_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_coupon_usage_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "ec_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ec_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_coupons: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean | null
          max_discount_amount: number | null
          min_order_amount: number | null
          per_user_limit: number | null
          updated_at: string | null
          usage_limit: number | null
          used_count: number | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_active?: boolean | null
          max_discount_amount?: number | null
          min_order_amount?: number | null
          per_user_limit?: number | null
          updated_at?: string | null
          usage_limit?: number | null
          used_count?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean | null
          max_discount_amount?: number | null
          min_order_amount?: number | null
          per_user_limit?: number | null
          updated_at?: string | null
          usage_limit?: number | null
          used_count?: number | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      ec_customers: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ec_feature_flags: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_enabled: boolean | null
          key: string
          label: string
          metadata: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          key: string
          label: string
          metadata?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          key?: string
          label?: string
          metadata?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ec_gift_card_transactions: {
        Row: {
          amount: number
          created_at: string | null
          gift_card_id: string
          id: string
          note: string | null
          order_id: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          gift_card_id: string
          id?: string
          note?: string | null
          order_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          gift_card_id?: string
          id?: string
          note?: string | null
          order_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_gift_card_transactions_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "ec_gift_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_gift_card_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ec_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_gift_cards: {
        Row: {
          code: string
          created_at: string | null
          currency: string | null
          current_balance: number
          expires_at: string | null
          id: string
          initial_balance: number
          is_active: boolean | null
          message: string | null
          purchased_by: string | null
          recipient_email: string | null
          recipient_name: string | null
          sender_name: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          currency?: string | null
          current_balance: number
          expires_at?: string | null
          id?: string
          initial_balance: number
          is_active?: boolean | null
          message?: string | null
          purchased_by?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          sender_name?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          currency?: string | null
          current_balance?: number
          expires_at?: string | null
          id?: string
          initial_balance?: number
          is_active?: boolean | null
          message?: string | null
          purchased_by?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          sender_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_gift_cards_purchased_by_fkey"
            columns: ["purchased_by"]
            isOneToOne: false
            referencedRelation: "ec_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_inventory: {
        Row: {
          allow_backorder: boolean | null
          created_at: string | null
          id: string
          low_stock_threshold: number | null
          product_id: string
          reserved_qty: number | null
          stock_qty: number | null
          track_inventory: boolean | null
          updated_at: string | null
          variant_id: string | null
        }
        Insert: {
          allow_backorder?: boolean | null
          created_at?: string | null
          id?: string
          low_stock_threshold?: number | null
          product_id: string
          reserved_qty?: number | null
          stock_qty?: number | null
          track_inventory?: boolean | null
          updated_at?: string | null
          variant_id?: string | null
        }
        Update: {
          allow_backorder?: boolean | null
          created_at?: string | null
          id?: string
          low_stock_threshold?: number | null
          product_id?: string
          reserved_qty?: number | null
          stock_qty?: number | null
          track_inventory?: boolean | null
          updated_at?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ec_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ec_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_inventory_log: {
        Row: {
          change_qty: number
          changed_by: string | null
          created_at: string | null
          id: string
          inventory_id: string
          note: string | null
          reason: string
        }
        Insert: {
          change_qty: number
          changed_by?: string | null
          created_at?: string | null
          id?: string
          inventory_id: string
          note?: string | null
          reason: string
        }
        Update: {
          change_qty?: number
          changed_by?: string | null
          created_at?: string | null
          id?: string
          inventory_id?: string
          note?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_inventory_log_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "ec_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          product_id: string | null
          product_image: string | null
          product_name: string
          quantity: number
          sku: string | null
          total_price: number
          unit_price: number
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          product_id?: string | null
          product_image?: string | null
          product_name: string
          quantity?: number
          sku?: string | null
          total_price: number
          unit_price: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          product_id?: string | null
          product_image?: string | null
          product_name?: string
          quantity?: number
          sku?: string | null
          total_price?: number
          unit_price?: number
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ec_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ec_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ec_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          id: string
          note: string | null
          order_id: string
          status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          order_id: string
          status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          note?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "ec_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_orders: {
        Row: {
          admin_notes: string | null
          billing_address: Json | null
          coupon_code: string | null
          created_at: string | null
          customer_id: string
          customer_notes: string | null
          discount_amount: number
          estimated_delivery: string | null
          gift_card_code: string | null
          id: string
          order_number: string
          payment_method: string | null
          payment_status: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          shipping_address: Json
          shipping_amount: number
          shipping_method: string | null
          status: string
          subtotal: number
          tax_amount: number
          total_amount: number
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          billing_address?: Json | null
          coupon_code?: string | null
          created_at?: string | null
          customer_id: string
          customer_notes?: string | null
          discount_amount?: number
          estimated_delivery?: string | null
          gift_card_code?: string | null
          id?: string
          order_number: string
          payment_method?: string | null
          payment_status?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          shipping_address: Json
          shipping_amount?: number
          shipping_method?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          billing_address?: Json | null
          coupon_code?: string | null
          created_at?: string | null
          customer_id?: string
          customer_notes?: string | null
          discount_amount?: number
          estimated_delivery?: string | null
          gift_card_code?: string | null
          id?: string
          order_number?: string
          payment_method?: string | null
          payment_status?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          shipping_address?: Json
          shipping_amount?: number
          shipping_method?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "ec_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_page_sections: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          is_visible: boolean | null
          page: string
          section_key: string
          sort_order: number | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          page?: string
          section_key: string
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          page?: string
          section_key?: string
          sort_order?: number | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ec_pincodes: {
        Row: {
          city: string | null
          cod_available: boolean | null
          created_at: string | null
          id: string
          is_serviceable: boolean | null
          pincode: string
          state: string | null
          zone_id: string
        }
        Insert: {
          city?: string | null
          cod_available?: boolean | null
          created_at?: string | null
          id?: string
          is_serviceable?: boolean | null
          pincode: string
          state?: string | null
          zone_id: string
        }
        Update: {
          city?: string | null
          cod_available?: boolean | null
          created_at?: string | null
          id?: string
          is_serviceable?: boolean | null
          pincode?: string
          state?: string | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_pincodes_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "ec_shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_product_images: {
        Row: {
          alt_text: string | null
          created_at: string | null
          id: string
          image_url: string
          is_primary: boolean | null
          product_id: string
          sort_order: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string | null
          id?: string
          image_url: string
          is_primary?: boolean | null
          product_id: string
          sort_order?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string | null
          id?: string
          image_url?: string
          is_primary?: boolean | null
          product_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ec_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_product_variants: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number
          product_id: string
          sale_price: number | null
          sku: string | null
          sort_order: number | null
          stock_qty: number | null
          weight_grams: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price: number
          product_id: string
          sale_price?: number | null
          sku?: string | null
          sort_order?: number | null
          stock_qty?: number | null
          weight_grams?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number
          product_id?: string
          sale_price?: number | null
          sku?: string | null
          sort_order?: number | null
          stock_qty?: number | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ec_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_products: {
        Row: {
          barcode: string | null
          base_price: number
          brand: string | null
          category_id: string | null
          cost_price: number | null
          created_at: string | null
          description: string | null
          dimensions_cm: Json | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_new_arrival: boolean | null
          meta_description: string | null
          meta_title: string | null
          name: string
          sale_price: number | null
          short_description: string | null
          sku: string | null
          slug: string
          tags: string[] | null
          updated_at: string | null
          weight_grams: number | null
        }
        Insert: {
          barcode?: string | null
          base_price?: number
          brand?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          dimensions_cm?: Json | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_new_arrival?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          name: string
          sale_price?: number | null
          short_description?: string | null
          sku?: string | null
          slug: string
          tags?: string[] | null
          updated_at?: string | null
          weight_grams?: number | null
        }
        Update: {
          barcode?: string | null
          base_price?: number
          brand?: string | null
          category_id?: string | null
          cost_price?: number | null
          created_at?: string | null
          description?: string | null
          dimensions_cm?: Json | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_new_arrival?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          name?: string
          sale_price?: number | null
          short_description?: string | null
          sku?: string | null
          slug?: string
          tags?: string[] | null
          updated_at?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ec_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_reviews: {
        Row: {
          admin_reply: string | null
          body: string | null
          created_at: string | null
          customer_id: string
          id: string
          is_approved: boolean | null
          is_featured: boolean | null
          is_verified_purchase: boolean | null
          product_id: string
          rating: number
          title: string | null
          updated_at: string | null
        }
        Insert: {
          admin_reply?: string | null
          body?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          is_approved?: boolean | null
          is_featured?: boolean | null
          is_verified_purchase?: boolean | null
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_reply?: string | null
          body?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          is_approved?: boolean | null
          is_featured?: boolean | null
          is_verified_purchase?: boolean | null
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "ec_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ec_products"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      ec_shipment_events: {
        Row: {
          created_at: string | null
          description: string
          event_time: string
          id: string
          location: string | null
          raw_data: Json | null
          shipment_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          description: string
          event_time?: string
          id?: string
          location?: string | null
          raw_data?: Json | null
          shipment_id: string
          status: string
        }
        Update: {
          created_at?: string | null
          description?: string
          event_time?: string
          id?: string
          location?: string | null
          raw_data?: Json | null
          shipment_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_shipment_events_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "ec_shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_shipments: {
        Row: {
          awb_number: string | null
          courier_code: string | null
          courier_name: string | null
          created_at: string | null
          delivered_at: string | null
          delivery_otp: string | null
          dimensions: Json | null
          estimated_delivery: string | null
          id: string
          label_url: string | null
          manifest_url: string | null
          order_id: string
          otp_verified: boolean | null
          out_for_delivery_at: string | null
          picked_up_at: string | null
          pickup_scheduled_at: string | null
          raw_response: Json | null
          shipped_at: string | null
          shipping_provider_order_id: string | null
          shipping_provider_shipment_id: string | null
          status: string
          tracking_url: string | null
          updated_at: string | null
          weight_grams: number | null
        }
        Insert: {
          awb_number?: string | null
          courier_code?: string | null
          courier_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_otp?: string | null
          dimensions?: Json | null
          estimated_delivery?: string | null
          id?: string
          label_url?: string | null
          manifest_url?: string | null
          order_id: string
          otp_verified?: boolean | null
          out_for_delivery_at?: string | null
          picked_up_at?: string | null
          pickup_scheduled_at?: string | null
          raw_response?: Json | null
          shipped_at?: string | null
          shipping_provider_order_id?: string | null
          shipping_provider_shipment_id?: string | null
          status?: string
          tracking_url?: string | null
          updated_at?: string | null
          weight_grams?: number | null
        }
        Update: {
          awb_number?: string | null
          courier_code?: string | null
          courier_name?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_otp?: string | null
          dimensions?: Json | null
          estimated_delivery?: string | null
          id?: string
          label_url?: string | null
          manifest_url?: string | null
          order_id?: string
          otp_verified?: boolean | null
          out_for_delivery_at?: string | null
          picked_up_at?: string | null
          pickup_scheduled_at?: string | null
          raw_response?: Json | null
          shipped_at?: string | null
          shipping_provider_order_id?: string | null
          shipping_provider_shipment_id?: string | null
          status?: string
          tracking_url?: string | null
          updated_at?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ec_shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "ec_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_shipping_providers: {
        Row: {
          code: string
          config: Json | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          supports_otp_delivery: boolean | null
          supports_pickup: boolean | null
          supports_rto: boolean | null
          tracking_url_template: string | null
        }
        Insert: {
          code: string
          config?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          supports_otp_delivery?: boolean | null
          supports_pickup?: boolean | null
          supports_rto?: boolean | null
          tracking_url_template?: string | null
        }
        Update: {
          code?: string
          config?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          supports_otp_delivery?: boolean | null
          supports_pickup?: boolean | null
          supports_rto?: boolean | null
          tracking_url_template?: string | null
        }
        Relationships: []
      }
      ec_shipping_rates: {
        Row: {
          base_charge: number
          created_at: string | null
          free_above: number | null
          id: string
          is_active: boolean | null
          max_weight_grams: number | null
          min_weight_grams: number | null
          per_kg_charge: number
          zone_id: string
        }
        Insert: {
          base_charge?: number
          created_at?: string | null
          free_above?: number | null
          id?: string
          is_active?: boolean | null
          max_weight_grams?: number | null
          min_weight_grams?: number | null
          per_kg_charge?: number
          zone_id: string
        }
        Update: {
          base_charge?: number
          created_at?: string | null
          free_above?: number | null
          id?: string
          is_active?: boolean | null
          max_weight_grams?: number | null
          min_weight_grams?: number | null
          per_kg_charge?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_shipping_rates_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "ec_shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      ec_shipping_zones: {
        Row: {
          created_at: string | null
          description: string | null
          estimated_days_max: number | null
          estimated_days_min: number | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          estimated_days_max?: number | null
          estimated_days_min?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          estimated_days_max?: number | null
          estimated_days_min?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      ec_wishlist_items: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          product_id: string
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          product_id: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ec_wishlist_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "ec_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ec_wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "ec_products"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          admin_name: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_value: Json | null
          previous_value: Json | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          admin_name?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          admin_name?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
        }
        Relationships: []
      }
      gift_card_batches: {
        Row: {
          batch_name: string
          code_format: string
          code_prefix: string | null
          created_at: string
          created_by: string | null
          generated_at: string
          generated_count: number
          id: string
          quantity: number
          template_id: string
        }
        Insert: {
          batch_name: string
          code_format?: string
          code_prefix?: string | null
          created_at?: string
          created_by?: string | null
          generated_at?: string
          generated_count?: number
          id?: string
          quantity: number
          template_id: string
        }
        Update: {
          batch_name?: string
          code_format?: string
          code_prefix?: string | null
          created_at?: string
          created_by?: string | null
          generated_at?: string
          generated_count?: number
          id?: string
          quantity?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_batches_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "gift_card_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          notes: string | null
          purchase_price: number
          status: string
          updated_at: string
          validity_days: number
          wallet_credit: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          notes?: string | null
          purchase_price?: number
          status?: string
          updated_at?: string
          validity_days?: number
          wallet_credit: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          notes?: string | null
          purchase_price?: number
          status?: string
          updated_at?: string
          validity_days?: number
          wallet_credit?: number
        }
        Relationships: []
      }
      gift_cards: {
        Row: {
          batch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          expires_at: string
          gift_card_id: string
          id: string
          purchase_price: number
          redeem_code: string
          redeemed_at: string | null
          redeemed_by: string | null
          sold_at: string | null
          status: string
          template_id: string
          updated_at: string
          wallet_credit: number
        }
        Insert: {
          batch_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          expires_at: string
          gift_card_id: string
          id?: string
          purchase_price?: number
          redeem_code: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          sold_at?: string | null
          status?: string
          template_id: string
          updated_at?: string
          wallet_credit: number
        }
        Update: {
          batch_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string
          gift_card_id?: string
          id?: string
          purchase_price?: number
          redeem_code?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          sold_at?: string | null
          status?: string
          template_id?: string
          updated_at?: string
          wallet_credit?: number
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "gift_card_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "gift_card_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      item_customization_groups: {
        Row: {
          id: string
          is_required: boolean
          item_id: string
          max_select: number
          min_select: number
          name: string
          sort_order: number
          type: string
        }
        Insert: {
          id?: string
          is_required?: boolean
          item_id: string
          max_select?: number
          min_select?: number
          name: string
          sort_order?: number
          type: string
        }
        Update: {
          id?: string
          is_required?: boolean
          item_id?: string
          max_select?: number
          min_select?: number
          name?: string
          sort_order?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_customization_groups_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          created_at: string
          current_points: number
          id: string
          lifetime_points: number
          tier_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_points?: number
          id?: string
          lifetime_points?: number
          tier_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_points?: number
          id?: string
          lifetime_points?: number
          tier_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "loyalty_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_actions: {
        Row: {
          created_at: string
          description: string
          event_type: string
          id: string
          is_active: boolean
          max_per_day: number | null
          name: string
          points: number
          slug: string
        }
        Insert: {
          created_at?: string
          description: string
          event_type: string
          id?: string
          is_active?: boolean
          max_per_day?: number | null
          name: string
          points: number
          slug: string
        }
        Update: {
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          is_active?: boolean
          max_per_day?: number | null
          name?: string
          points?: number
          slug?: string
        }
        Relationships: []
      }
      loyalty_ledger: {
        Row: {
          balance_after: number
          created_at: string
          description: string
          id: string
          monetary_value: number
          order_id: string | null
          points: number
          source: string
          type: string
          user_id: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          description: string
          id?: string
          monetary_value?: number
          order_id?: string | null
          points: number
          source: string
          type: string
          user_id: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          description?: string
          id?: string
          monetary_value?: number
          order_id?: string | null
          points?: number
          source?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_points_log: {
        Row: {
          action_id: string | null
          created_at: string
          description: string
          id: string
          mission_id: string | null
          points: number
          reference_id: string | null
          user_id: string
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          description: string
          id?: string
          mission_id?: string | null
          points: number
          reference_id?: string | null
          user_id: string
        }
        Update: {
          action_id?: string | null
          created_at?: string
          description?: string
          id?: string
          mission_id?: string | null
          points?: number
          reference_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_points_log_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "loyalty_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_log_mission_fk"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_tiers: {
        Row: {
          benefits: Json
          id: string
          min_lifetime_points: number
          multiplier: number
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          benefits?: Json
          id?: string
          min_lifetime_points?: number
          multiplier?: number
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          benefits?: Json
          id?: string
          min_lifetime_points?: number
          multiplier?: number
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      membership_cycles: {
        Row: {
          created_at: string
          current_tier: string
          cycle_end: string
          cycle_order_count: number
          cycle_start: string
          id: string
          is_active: boolean
          starting_tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_tier?: string
          cycle_end: string
          cycle_order_count?: number
          cycle_start?: string
          id?: string
          is_active?: boolean
          starting_tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_tier?: string
          cycle_end?: string
          cycle_order_count?: number
          cycle_start?: string
          id?: string
          is_active?: boolean
          starting_tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          base_price: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_bestseller: boolean
          is_new: boolean
          is_veg: boolean
          name: string
          slug: string
          sort_order: number
          subcategory_id: string
          updated_at: string
        }
        Insert: {
          base_price: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_bestseller?: boolean
          is_new?: boolean
          is_veg?: boolean
          name: string
          slug: string
          sort_order?: number
          subcategory_id: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_bestseller?: boolean
          is_new?: boolean
          is_veg?: boolean
          name?: string
          slug?: string
          sort_order?: number
          subcategory_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "menu_subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_subcategories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      mission_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          current_count: number
          id: string
          is_completed: boolean
          mission_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_count?: number
          id?: string
          is_completed?: boolean
          mission_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_count?: number
          id?: string
          is_completed?: boolean
          mission_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_progress_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          created_at: string
          description: string
          ends_at: string | null
          id: string
          is_active: boolean
          name: string
          reward_points: number
          reward_type: string
          reward_value: Json
          starts_at: string
          target_count: number
          target_event: string
          type: string
        }
        Insert: {
          created_at?: string
          description: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          reward_points?: number
          reward_type?: string
          reward_value?: Json
          starts_at?: string
          target_count?: number
          target_event: string
          type: string
        }
        Update: {
          created_at?: string
          description?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          reward_points?: number
          reward_type?: string
          reward_value?: Json
          starts_at?: string
          target_count?: number
          target_event?: string
          type?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          id: string
          is_read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          customizations: Json
          id: string
          item_id: string
          item_name: string
          order_id: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          customizations?: Json
          id?: string
          item_id: string
          item_name: string
          order_id: string
          quantity?: number
          total_price: number
          unit_price: number
        }
        Update: {
          customizations?: Json
          id?: string
          item_id?: string
          item_name?: string
          order_id?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_ratings: {
        Row: {
          created_at: string
          id: string
          order_id: string
          rating: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          rating: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_ratings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          coupon_code: string | null
          created_at: string
          delivery_code: string | null
          discount: number
          estimated_ready_at: string | null
          id: string
          loyalty_discount: number
          loyalty_points_used: number
          notes: string | null
          order_number: string
          outlet_id: string
          packaging_charge: number
          payment_method: string
          payment_status: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          status: string
          subtotal: number
          tax: number
          total: number
          updated_at: string
          user_id: string
          wallet_used: number
        }
        Insert: {
          coupon_code?: string | null
          created_at?: string
          delivery_code?: string | null
          discount?: number
          estimated_ready_at?: string | null
          id?: string
          loyalty_discount?: number
          loyalty_points_used?: number
          notes?: string | null
          order_number: string
          outlet_id: string
          packaging_charge?: number
          payment_method: string
          payment_status?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          subtotal: number
          tax?: number
          total: number
          updated_at?: string
          user_id: string
          wallet_used?: number
        }
        Update: {
          coupon_code?: string | null
          created_at?: string
          delivery_code?: string | null
          discount?: number
          estimated_ready_at?: string | null
          id?: string
          loyalty_discount?: number
          loyalty_points_used?: number
          notes?: string | null
          order_number?: string
          outlet_id?: string
          packaging_charge?: number
          payment_method?: string
          payment_status?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string
          subtotal?: number
          tax?: number
          total?: number
          updated_at?: string
          user_id?: string
          wallet_used?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outlet_menu_items: {
        Row: {
          is_available: boolean
          item_id: string
          outlet_id: string
          price_override: number | null
        }
        Insert: {
          is_available?: boolean
          item_id: string
          outlet_id: string
          price_override?: number | null
        }
        Update: {
          is_available?: boolean
          item_id?: string
          outlet_id?: string
          price_override?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "outlet_menu_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outlet_menu_items_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      outlet_settings: {
        Row: {
          auto_accept_orders: boolean
          estimated_prep_time: number
          max_concurrent_orders: number
          new_order_sound: boolean
          outlet_id: string
          updated_at: string
        }
        Insert: {
          auto_accept_orders?: boolean
          estimated_prep_time?: number
          max_concurrent_orders?: number
          new_order_sound?: boolean
          outlet_id: string
          updated_at?: string
        }
        Update: {
          auto_accept_orders?: boolean
          estimated_prep_time?: number
          max_concurrent_orders?: number
          new_order_sound?: boolean
          outlet_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlet_settings_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: true
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
        ]
      }
      outlet_staff: {
        Row: {
          created_at: string
          id: string
          is_manager: boolean
          outlet_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_manager?: boolean
          outlet_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_manager?: boolean
          outlet_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlet_staff_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "outlets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outlet_staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      outlets: {
        Row: {
          address: string
          city: string
          closes_at: string
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          is_manually_closed: boolean
          latitude: number
          longitude: number
          manual_close_reason: string | null
          name: string
          opens_at: string
          phone: string
          pincode: string
          slug: string
          state: string
          updated_at: string
        }
        Insert: {
          address: string
          city: string
          closes_at?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_manually_closed?: boolean
          latitude: number
          longitude: number
          manual_close_reason?: string | null
          name: string
          opens_at?: string
          phone: string
          pincode: string
          slug: string
          state: string
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string
          closes_at?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_manually_closed?: boolean
          latitude?: number
          longitude?: number
          manual_close_reason?: string | null
          name?: string
          opens_at?: string
          phone?: string
          pincode?: string
          slug?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_attempts: {
        Row: {
          amount_paise: number
          app_order_id: string | null
          checkout_quote_id: string | null
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          items_payload: Json
          loyalty_points: number
          nth_order_discount: number
          order_payload: Json
          razorpay_order_id: string
          razorpay_payment_id: string | null
          status: string
          updated_at: string
          user_id: string
          wallet_amount: number
        }
        Insert: {
          amount_paise: number
          app_order_id?: string | null
          checkout_quote_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          items_payload: Json
          loyalty_points?: number
          nth_order_discount?: number
          order_payload: Json
          razorpay_order_id: string
          razorpay_payment_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          wallet_amount?: number
        }
        Update: {
          amount_paise?: number
          app_order_id?: string | null
          checkout_quote_id?: string | null
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          items_payload?: Json
          loyalty_points?: number
          nth_order_discount?: number
          order_payload?: Json
          razorpay_order_id?: string
          razorpay_payment_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          wallet_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_app_order_id_fkey"
            columns: ["app_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_attempts_checkout_quote_id_fkey"
            columns: ["checkout_quote_id"]
            isOneToOne: true
            referencedRelation: "checkout_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          referral_code: string | null
          referred_by: string | null
          role: string
          updated_at: string
          welcome_email_sent_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: string
          updated_at?: string
          welcome_email_sent_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: string
          updated_at?: string
          welcome_email_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_response: string | null
          category: string
          created_at: string
          id: string
          message: string
          status: string
          subject: string
          ticket_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          category: string
          created_at?: string
          id?: string
          message: string
          status?: string
          subject: string
          ticket_number?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          category?: string
          created_at?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          ticket_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string
          id: string
          reference_id: string | null
          type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description: string
          id?: string
          reference_id?: string | null
          type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string
          id?: string
          reference_id?: string | null
          type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          bonus_balance: number
          created_at: string
          id: string
          loaded_balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_balance?: number
          created_at?: string
          id?: string
          loaded_balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_balance?: number
          created_at?: string
          id?: string
          loaded_balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_referral_code: { Args: { p_referral_code: string }; Returns: Json }
      award_loyalty_points: {
        Args: {
          p_action_slug: string
          p_custom_points?: number
          p_reference_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      award_referral_rewards: {
        Args: { p_referred_user_id: string; p_reward_trigger: string }
        Returns: Json
      }
      calculate_max_redeemable_points: {
        Args: {
          p_has_coupon?: boolean
          p_has_discounted_items?: boolean
          p_packaging: number
          p_subtotal: number
          p_tax: number
          p_user_id: string
        }
        Returns: Json
      }
      can_manage_order: { Args: { p_order_id: string }; Returns: boolean }
      check_membership_renewals: { Args: never; Returns: Json }
      check_nth_order_discount: { Args: { p_user_id: string }; Returns: Json }
      claim_referral_reward: { Args: never; Returns: Json }
      complete_order_with_pickup_code: {
        Args: { p_code: string; p_order_id: string }
        Returns: Json
      }
      consume_api_rate_limit: {
        Args: {
          p_limit: number
          p_scope: string
          p_subject_hash: string
          p_window_seconds: number
        }
        Returns: Json
      }
      create_checkout_quote: {
        Args: {
          p_items: Json
          p_loyalty_points?: number
          p_nth_order_discount?: number
          p_order: Json
          p_user_id: string
          p_wallet_amount?: number
        }
        Returns: Json
      }
      create_notification: {
        Args: {
          p_body: string
          p_data?: Json
          p_title: string
          p_type?: string
          p_user_id: string
        }
        Returns: string
      }
      expire_gift_cards: { Args: never; Returns: Json }
      finalize_captured_payment_attempt: {
        Args: { p_attempt_id: string }
        Returns: Json
      }
      generate_gift_card_batch: {
        Args: {
          p_batch_name: string
          p_code_format?: string
          p_code_prefix?: string
          p_quantity: number
          p_template_id: string
        }
        Returns: Json
      }
      get_claimable_referral_rewards: { Args: never; Returns: number }
      get_loyalty_analytics: { Args: never; Returns: Json }
      get_membership_status: { Args: { p_user_id: string }; Returns: Json }
      grant_referral_points: {
        Args: {
          p_description: string
          p_points: number
          p_reference_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_outlet_staff_for_order: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      is_outlet_staff_for_outlet: {
        Args: { p_outlet_id: string }
        Returns: boolean
      }
      manual_refund_order: { Args: { p_order_id: string }; Returns: Json }
      place_order_with_wallet: {
        Args: {
          p_items: Json[]
          p_loyalty_points?: number
          p_nth_order_discount?: number
          p_order: Json
          p_wallet_amount?: number
        }
        Returns: Json
      }
      place_order_with_wallet_validated_impl: {
        Args: {
          p_items: Json[]
          p_loyalty_points?: number
          p_nth_order_discount?: number
          p_order: Json
          p_wallet_amount?: number
        }
        Returns: Json
      }
      redeem_gift_card: { Args: { p_redeem_code: string }; Returns: Json }
      redeem_loyalty_points: {
        Args: { p_order_id: string; p_points: number; p_user_id: string }
        Returns: Json
      }
      reject_and_refund_order: { Args: { p_order_id: string }; Returns: Json }
      reject_order_with_refund: { Args: { p_order_id: string }; Returns: Json }
      renew_expired_membership_cycles: { Args: never; Returns: Json }
      replace_coupon_outlet_restrictions: {
        Args: { p_coupon_id: string; p_outlet_ids: string[] }
        Returns: undefined
      }
      self_topup_wallet: {
        Args: {
          p_amount: number
          p_razorpay_order_id: string
          p_razorpay_payment_id: string
          p_user_id: string
        }
        Returns: Json
      }
      set_pickup_otp_required: { Args: { p_required: boolean }; Returns: Json }
      topup_wallet: {
        Args: {
          p_amount: number
          p_bonus?: number
          p_reference_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      update_order_status: {
        Args: { p_order_id: string; p_status: string }
        Returns: Json
      }
      upsert_outlet_menu_item: {
        Args: {
          p_is_available: boolean
          p_item_id: string
          p_outlet_id: string
          p_price_override?: number
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

// Helper types derived from Database
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Outlet = Database["public"]["Tables"]["outlets"]["Row"];
export type MenuCategory = Database["public"]["Tables"]["menu_categories"]["Row"];
export type MenuSubcategory = Database["public"]["Tables"]["menu_subcategories"]["Row"];
export type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
export type CustomizationGroup = Database["public"]["Tables"]["item_customization_groups"]["Row"];
export type CustomizationOption = Database["public"]["Tables"]["customization_options"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItem = Database["public"]["Tables"]["order_items"]["Row"];
export type Wallet = Database["public"]["Tables"]["wallets"]["Row"];
export type WalletTransaction = Database["public"]["Tables"]["wallet_transactions"]["Row"];
export type LoyaltyTier = Database["public"]["Tables"]["loyalty_tiers"]["Row"];
export type LoyaltyAccount = Database["public"]["Tables"]["loyalty_accounts"]["Row"];
export type LoyaltyAction = Database["public"]["Tables"]["loyalty_actions"]["Row"];
export type Mission = Database["public"]["Tables"]["missions"]["Row"];
export type Coupon = Database["public"]["Tables"]["coupons"]["Row"];
export type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

// New tables
export type OutletStaff = {
  id: string;
  outlet_id: string;
  user_id: string;
  is_manager: boolean;
  created_at: string;
};

export type OutletSettings = {
  outlet_id: string;
  auto_accept_orders: boolean;
  estimated_prep_time: number;
  max_concurrent_orders: number;
  new_order_sound: boolean;
  updated_at: string;
};

// Extended types with relations
export type MenuItemWithCustomizations = MenuItem & {
  customization_groups: (CustomizationGroup & {
    options: CustomizationOption[];
  })[];
};

export type MenuCategoryWithItems = MenuCategory & {
  subcategories: (MenuSubcategory & {
    items: MenuItem[];
  })[];
};

export type OrderWithItems = Order & {
  items: OrderItem[];
  outlet: Pick<Outlet, "name" | "address">;
};
