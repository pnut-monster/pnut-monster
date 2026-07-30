-- Batch/Pool Order System — Core Tables
-- This migration adds all tables needed for the batch ordering system.
-- It does NOT modify any existing data or behavior — only adds new structures.

--------------------------------------------------------------
-- 1. Extend profiles role constraint to include 'representative'
--------------------------------------------------------------
alter table public.profiles
  drop constraint profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('customer', 'admin', 'super_admin', 'outlet_staff', 'representative'));

--------------------------------------------------------------
-- 2. Add batch_config JSONB to outlets (nullable, no default)
--------------------------------------------------------------
alter table public.outlets
  add column batch_config jsonb;

--------------------------------------------------------------
-- 3. Delivery Hubs
--------------------------------------------------------------
create table public.delivery_hubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger delivery_hubs_updated_at
  before update on public.delivery_hubs
  for each row execute function public.update_updated_at();

--------------------------------------------------------------
-- 4. Delivery Blocks
--------------------------------------------------------------
create table public.delivery_blocks (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references public.delivery_hubs(id) on delete cascade,
  name text not null,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_delivery_blocks_hub on public.delivery_blocks(hub_id);

create trigger delivery_blocks_updated_at
  before update on public.delivery_blocks
  for each row execute function public.update_updated_at();

--------------------------------------------------------------
-- 5. Delivery Sub-Locations
--------------------------------------------------------------
create table public.delivery_sub_locations (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.delivery_blocks(id) on delete cascade,
  name text not null,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_delivery_sub_locations_block on public.delivery_sub_locations(block_id);

create trigger delivery_sub_locations_updated_at
  before update on public.delivery_sub_locations
  for each row execute function public.update_updated_at();

--------------------------------------------------------------
-- 6. Outlet-Hub Links (many-to-many)
--------------------------------------------------------------
create table public.outlet_hub_links (
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  hub_id uuid not null references public.delivery_hubs(id) on delete cascade,
  primary key (outlet_id, hub_id)
);

--------------------------------------------------------------
-- 7. Batch Windows
--------------------------------------------------------------
create table public.batch_windows (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  hub_id uuid not null references public.delivery_hubs(id),
  start_time timestamptz not null,
  end_time timestamptz not null check (end_time > start_time),
  max_orders int not null check (max_orders > 0),
  current_order_count int not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  counter_display_mode text not null default 'exact' check (counter_display_mode in ('exact', 'urgency')),
  counter_visual_style text not null default 'static' check (counter_visual_style in ('animated', 'static')),
  status text not null default 'scheduled' check (status in ('scheduled', 'open', 'closed', 'processing', 'fulfilled', 'cancelled')),
  closed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_batch_windows_outlet on public.batch_windows(outlet_id);
create index idx_batch_windows_status on public.batch_windows(status);
create index idx_batch_windows_hub on public.batch_windows(hub_id);

-- Enforce: only one open window per outlet at a time
create unique index idx_batch_windows_one_open_per_outlet
  on public.batch_windows(outlet_id) where (status = 'open');

create trigger batch_windows_updated_at
  before update on public.batch_windows
  for each row execute function public.update_updated_at();

--------------------------------------------------------------
-- 8. Batch Slot Reservations (IRCTC-style lock)
--------------------------------------------------------------
create table public.batch_slot_reservations (
  id uuid primary key default gen_random_uuid(),
  batch_window_id uuid not null references public.batch_windows(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  status text not null default 'held' check (status in ('held', 'confirmed', 'expired')),
  reserved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index idx_batch_slot_reservations_window on public.batch_slot_reservations(batch_window_id);
create index idx_batch_slot_reservations_user on public.batch_slot_reservations(user_id);
create index idx_batch_slot_reservations_status on public.batch_slot_reservations(status);
create index idx_batch_slot_reservations_expires on public.batch_slot_reservations(expires_at) where (status = 'held');

-- One active reservation per user per window
create unique index idx_batch_slot_reservations_one_per_user
  on public.batch_slot_reservations(batch_window_id, user_id) where (status = 'held');

--------------------------------------------------------------
-- 9. Add batch_window_id to orders (nullable FK, no default)
--------------------------------------------------------------
alter table public.orders
  add column batch_window_id uuid references public.batch_windows(id);

create index idx_orders_batch_window on public.orders(batch_window_id) where (batch_window_id is not null);

--------------------------------------------------------------
-- 10. Representatives
--------------------------------------------------------------
create table public.representatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  block_id uuid not null references public.delivery_blocks(id),
  name text not null,
  phone text,
  commission_type text not null default 'flat_per_order' check (commission_type in ('flat_per_order', 'percentage', 'flat_per_batch')),
  commission_value numeric(10,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_representatives_outlet on public.representatives(outlet_id);
create index idx_representatives_block on public.representatives(block_id);
create index idx_representatives_user on public.representatives(user_id);

create trigger representatives_updated_at
  before update on public.representatives
  for each row execute function public.update_updated_at();

--------------------------------------------------------------
-- 11. Batch Orders (links order to batch context)
--------------------------------------------------------------
create table public.batch_orders (
  id uuid primary key default gen_random_uuid(),
  batch_window_id uuid not null references public.batch_windows(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  block_id uuid not null references public.delivery_blocks(id),
  sub_location_id uuid references public.delivery_sub_locations(id),
  sub_location_text text,
  rep_id uuid references public.representatives(id),
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'out_for_delivery', 'delivered', 'undeliverable')),
  undeliverable_reason text,
  undeliverable_note text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_batch_orders_window on public.batch_orders(batch_window_id);
create index idx_batch_orders_order on public.batch_orders(order_id);
create index idx_batch_orders_rep on public.batch_orders(rep_id);
create index idx_batch_orders_block on public.batch_orders(block_id);
create index idx_batch_orders_delivery_status on public.batch_orders(delivery_status);

create trigger batch_orders_updated_at
  before update on public.batch_orders
  for each row execute function public.update_updated_at();

--------------------------------------------------------------
-- 12. Rep Commission Ledger
--------------------------------------------------------------
create table public.rep_commission_ledger (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.representatives(id) on delete cascade,
  batch_window_id uuid not null references public.batch_windows(id) on delete cascade,
  orders_delivered int not null default 0,
  amount_earned numeric(10,2) not null default 0,
  settled boolean not null default false,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_rep_commission_ledger_rep on public.rep_commission_ledger(rep_id);
create index idx_rep_commission_ledger_window on public.rep_commission_ledger(batch_window_id);
create index idx_rep_commission_ledger_settled on public.rep_commission_ledger(settled);

--------------------------------------------------------------
-- 13. Item Components (for prep sheet aggregation)
--------------------------------------------------------------
create table public.item_components (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  customization_option_id uuid references public.customization_options(id) on delete cascade,
  component_name text not null,
  component_category text not null,
  quantity numeric(10,3) not null default 1,
  unit text not null default 'piece',
  prep_instruction_template text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_item_components_menu_item on public.item_components(menu_item_id);
create index idx_item_components_option on public.item_components(customization_option_id);
create index idx_item_components_category on public.item_components(component_category);

--------------------------------------------------------------
-- 14. Seed global batch settings into app_settings
--------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('batch_slot_timer_seconds', '180')
on conflict (key) do nothing;

--------------------------------------------------------------
-- 15. Add batch-specific order statuses to the orders check constraint
--------------------------------------------------------------
alter table public.orders
  drop constraint orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'cancelled', 'rejected', 'batch_pending', 'out_for_delivery', 'delivered'));
