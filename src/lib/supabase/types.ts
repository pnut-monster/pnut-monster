export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          phone: string | null;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          role: "customer" | "admin" | "super_admin" | "outlet_staff";
          referral_code: string | null;
          referred_by: string | null;
          date_of_birth: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          phone?: string | null;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: "customer" | "admin" | "super_admin" | "outlet_staff";
          referral_code?: string | null;
          referred_by?: string | null;
          date_of_birth?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      outlets: {
        Row: {
          id: string;
          name: string;
          slug: string;
          address: string;
          city: string;
          state: string;
          pincode: string;
          latitude: number;
          longitude: number;
          phone: string;
          image_url: string | null;
          is_active: boolean;
          is_manually_closed: boolean;
          manual_close_reason: string | null;
          opens_at: string;
          closes_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["outlets"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["outlets"]["Insert"]>;
      };
      menu_categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          image_url: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["menu_categories"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["menu_categories"]["Insert"]>;
      };
      menu_subcategories: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          slug: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["menu_subcategories"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["menu_subcategories"]["Insert"]>;
      };
      menu_items: {
        Row: {
          id: string;
          subcategory_id: string;
          name: string;
          slug: string;
          description: string | null;
          image_url: string | null;
          base_price: number;
          is_veg: boolean;
          is_bestseller: boolean;
          is_new: boolean;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["menu_items"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["menu_items"]["Insert"]>;
      };
      item_customization_groups: {
        Row: {
          id: string;
          item_id: string;
          name: string;
          type: "base" | "topping" | "flavour" | "extra";
          is_required: boolean;
          min_select: number;
          max_select: number;
          sort_order: number;
        };
        Insert: Omit<Database["public"]["Tables"]["item_customization_groups"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["item_customization_groups"]["Insert"]>;
      };
      customization_options: {
        Row: {
          id: string;
          group_id: string;
          name: string;
          price: number;
          is_default: boolean;
          is_active: boolean;
          sort_order: number;
        };
        Insert: Omit<Database["public"]["Tables"]["customization_options"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["customization_options"]["Insert"]>;
      };
      outlet_menu_items: {
        Row: {
          outlet_id: string;
          item_id: string;
          is_available: boolean;
          price_override: number | null;
        };
        Insert: Database["public"]["Tables"]["outlet_menu_items"]["Row"];
        Update: Partial<Database["public"]["Tables"]["outlet_menu_items"]["Insert"]>;
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          user_id: string;
          outlet_id: string;
          status: "pending" | "confirmed" | "preparing" | "ready" | "picked_up" | "cancelled" | "rejected";
          subtotal: number;
          tax: number;
          packaging_charge: number;
          discount: number;
          wallet_used: number;
          loyalty_points_used: number;
          loyalty_discount: number;
          total: number;
          payment_method: "online" | "wallet" | "split";
          payment_status: "pending" | "paid" | "refunded";
          coupon_code: string | null;
          notes: string | null;
          estimated_ready_at: string | null;
          delivery_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["orders"]["Row"], "id" | "order_number" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["orders"]["Insert"]>;
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          item_id: string;
          item_name: string;
          quantity: number;
          unit_price: number;
          total_price: number;
          customizations: Json;
        };
        Insert: Omit<Database["public"]["Tables"]["order_items"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["order_items"]["Insert"]>;
      };
      wallets: {
        Row: {
          id: string;
          user_id: string;
          loaded_balance: number;
          bonus_balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["wallets"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["wallets"]["Insert"]>;
      };
      wallet_transactions: {
        Row: {
          id: string;
          wallet_id: string;
          type: "topup" | "bonus" | "debit" | "refund";
          amount: number;
          balance_after: number;
          description: string;
          reference_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["wallet_transactions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["wallet_transactions"]["Insert"]>;
      };
      loyalty_tiers: {
        Row: {
          id: string;
          name: string;
          slug: string;
          min_lifetime_points: number;
          multiplier: number;
          benefits: Json;
          sort_order: number;
        };
        Insert: Omit<Database["public"]["Tables"]["loyalty_tiers"]["Row"], "id">;
        Update: Partial<Database["public"]["Tables"]["loyalty_tiers"]["Insert"]>;
      };
      loyalty_accounts: {
        Row: {
          id: string;
          user_id: string;
          tier_id: string;
          current_points: number;
          lifetime_points: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["loyalty_accounts"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["loyalty_accounts"]["Insert"]>;
      };
      loyalty_actions: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string;
          points: number;
          event_type: string;
          max_per_day: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["loyalty_actions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["loyalty_actions"]["Insert"]>;
      };
      loyalty_points_log: {
        Row: {
          id: string;
          user_id: string;
          action_id: string | null;
          mission_id: string | null;
          points: number;
          description: string;
          reference_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["loyalty_points_log"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["loyalty_points_log"]["Insert"]>;
      };
      missions: {
        Row: {
          id: string;
          name: string;
          description: string;
          type: "one_time" | "recurring" | "streak";
          target_event: string;
          target_count: number;
          reward_points: number;
          reward_type: "points" | "coupon" | "badge";
          reward_value: Json;
          starts_at: string;
          ends_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["missions"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["missions"]["Insert"]>;
      };
      mission_progress: {
        Row: {
          id: string;
          user_id: string;
          mission_id: string;
          current_count: number;
          is_completed: boolean;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["mission_progress"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["mission_progress"]["Insert"]>;
      };
      coupons: {
        Row: {
          id: string;
          code: string;
          description: string;
          discount_type: "percentage" | "flat";
          discount_value: number;
          min_order: number;
          max_discount: number | null;
          usage_limit: number | null;
          used_count: number;
          starts_at: string;
          ends_at: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["coupons"]["Row"], "id" | "used_count" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["coupons"]["Insert"]>;
      };
      campaigns: {
        Row: {
          id: string;
          name: string;
          type: "wallet_topup_bonus" | "referral" | "birthday" | "first_order";
          config: Json;
          starts_at: string;
          ends_at: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["campaigns"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Insert"]>;
      };
      customer_addresses: {
        Row: {
          id: string; user_id: string; label: string; recipient_name: string;
          phone: string; address_line_1: string; address_line_2: string | null;
          landmark: string | null; city: string; state: string; pincode: string;
          is_default: boolean; created_at: string; updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["customer_addresses"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["customer_addresses"]["Insert"]>;
      };
      support_tickets: {
        Row: {
          id: string; ticket_number: string; user_id: string;
          category: "order" | "payment" | "wallet" | "account" | "feedback" | "other";
          subject: string; message: string;
          status: "open" | "in_progress" | "resolved" | "closed";
          admin_response: string | null; created_at: string; updated_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["support_tickets"]["Row"], "id" | "ticket_number" | "created_at" | "updated_at" | "admin_response"> & { admin_response?: string | null };
        Update: Partial<Database["public"]["Tables"]["support_tickets"]["Insert"]>;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          body: string;
          type: "order" | "wallet" | "loyalty" | "campaign" | "general";
          data: Json;
          is_read: boolean;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["notifications"]["Row"], "id" | "is_read" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      topup_wallet: {
        Args: { p_user_id: string; p_amount: number; p_bonus: number; p_reference_id: string };
        Returns: Json;
      };
      place_order_with_wallet: {
        Args: {
          p_order: Json;
          p_items: Json[];
          p_wallet_amount: number;
          p_loyalty_points?: number;
          p_nth_order_discount?: number;
        };
        Returns: Json;
      };
      award_loyalty_points: {
        Args: { p_user_id: string; p_action_slug: string; p_reference_id: string };
        Returns: Json;
      };
      update_order_status: {
        Args: { p_order_id: string; p_status: string };
        Returns: Json;
      };
      complete_order_with_pickup_code: {
        Args: { p_order_id: string; p_code: string };
        Returns: Json;
      };
      upsert_outlet_menu_item: {
        Args: {
          p_outlet_id: string;
          p_item_id: string;
          p_is_available: boolean;
          p_price_override?: number | null;
        };
        Returns: Json;
      };
      set_pickup_otp_required: {
        Args: { p_required: boolean };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
  };
}

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
