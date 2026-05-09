create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references public.profiles(id),
  outlet_id uuid not null references public.outlets(id),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'cancelled')),
  subtotal numeric(10,2) not null,
  tax numeric(10,2) not null default 0,
  packaging_charge numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  wallet_used numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  payment_method text not null check (payment_method in ('online', 'wallet', 'split')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'refunded')),
  coupon_code text,
  notes text,
  estimated_ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.update_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  item_id uuid not null references public.menu_items(id),
  item_name text not null,
  quantity int not null default 1,
  unit_price numeric(10,2) not null,
  total_price numeric(10,2) not null,
  customizations jsonb not null default '[]'
);

-- Indexes
create index idx_orders_user on public.orders(user_id);
create index idx_orders_outlet on public.orders(outlet_id);
create index idx_orders_status on public.orders(status);
create index idx_orders_created_at on public.orders(created_at desc);
create index idx_order_items_order on public.order_items(order_id);
