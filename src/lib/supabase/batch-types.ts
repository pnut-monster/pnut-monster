/**
 * Temporary type declarations for batch system tables.
 * These will be removed once migrations are run and types are regenerated via:
 *   supabase gen types typescript --local > src/lib/supabase/types.ts
 */

export type DeliveryHub = {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  created_at: string;
};

export type DeliveryBlock = {
  id: string;
  hub_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
};

export type DeliverySubLocation = {
  id: string;
  block_id: string;
  name: string;
  floor_or_detail: string | null;
  is_active: boolean;
  created_at: string;
};

export type OutletHubLink = {
  id: string;
  outlet_id: string;
  hub_id: string;
  created_at: string;
};

export type BatchWindow = {
  id: string;
  outlet_id: string;
  hub_id: string;
  start_time: string;
  end_time: string;
  max_orders: number;
  current_order_count: number;
  delivery_fee: number;
  counter_display_mode: string;
  counter_visual_style: string;
  status: string;
  closed_at: string | null;
  created_at: string;
};

export type BatchSlotReservation = {
  id: string;
  batch_window_id: string;
  user_id: string;
  status: string;
  reserved_at: string;
  expires_at: string;
  confirmed_at: string | null;
};

export type BatchOrder = {
  id: string;
  batch_window_id: string;
  order_id: string;
  rep_id: string | null;
  block_id: string | null;
  sub_location_id: string | null;
  sub_location_text: string | null;
  sequence_number: number;
  status: string;
  delivered_at: string | null;
  created_at: string;
};

export type Representative = {
  id: string;
  user_id: string;
  hub_id: string;
  full_name: string;
  phone: string;
  commission_type: string;
  commission_value: number;
  is_active: boolean;
  created_at: string;
};

export type RepCommissionLedger = {
  id: string;
  rep_id: string;
  batch_window_id: string;
  orders_delivered: number;
  amount_earned: number;
  settled: boolean;
  created_at: string;
};

export type ItemComponent = {
  id: string;
  menu_item_id: string;
  customization_option_id: string | null;
  component_name: string;
  component_category: string;
  quantity: number;
  unit: string;
  prep_instruction_template: string | null;
  created_at: string;
};
