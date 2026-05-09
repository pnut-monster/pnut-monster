create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  discount_type text not null check (discount_type in ('percentage', 'flat')),
  discount_value numeric(10,2) not null,
  min_order numeric(10,2) not null default 0,
  max_discount numeric(10,2),
  usage_limit int,
  used_count int not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.coupon_usage (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id),
  user_id uuid not null references public.profiles(id),
  order_id uuid not null references public.orders(id),
  discount_amount numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create index idx_coupons_code on public.coupons(code);
create index idx_coupons_active on public.coupons(is_active, starts_at, ends_at);
create index idx_coupon_usage_user on public.coupon_usage(user_id);
