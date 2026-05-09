create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.menu_subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.menu_categories(id) on delete cascade,
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  subcategory_id uuid not null references public.menu_subcategories(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  base_price numeric(10,2) not null,
  is_veg boolean not null default true,
  is_bestseller boolean not null default false,
  is_new boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger menu_items_updated_at
  before update on public.menu_items
  for each row execute function public.update_updated_at();

create table public.item_customization_groups (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  type text not null check (type in ('base', 'topping', 'flavour', 'extra')),
  is_required boolean not null default false,
  min_select int not null default 0,
  max_select int not null default 1,
  sort_order int not null default 0
);

create table public.customization_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.item_customization_groups(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0
);

-- Outlet-specific menu availability and pricing
create table public.outlet_menu_items (
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  item_id uuid not null references public.menu_items(id) on delete cascade,
  is_available boolean not null default true,
  price_override numeric(10,2),
  primary key (outlet_id, item_id)
);

-- Indexes
create index idx_menu_subcategories_category on public.menu_subcategories(category_id);
create index idx_menu_items_subcategory on public.menu_items(subcategory_id);
create index idx_menu_items_active on public.menu_items(is_active);
create index idx_customization_groups_item on public.item_customization_groups(item_id);
create index idx_customization_options_group on public.customization_options(group_id);
create index idx_outlet_menu_items_outlet on public.outlet_menu_items(outlet_id);
