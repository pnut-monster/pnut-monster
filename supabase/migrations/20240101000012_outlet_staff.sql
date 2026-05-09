-- Outlet staff assignments
-- Maps staff members to their assigned outlets
create table public.outlet_staff (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references public.outlets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_manager boolean not null default false,
  created_at timestamptz not null default now(),
  unique(outlet_id, user_id)
);

create index idx_outlet_staff_outlet on public.outlet_staff(outlet_id);
create index idx_outlet_staff_user on public.outlet_staff(user_id);

-- Outlet settings (per-outlet operational config)
create table public.outlet_settings (
  outlet_id uuid primary key references public.outlets(id) on delete cascade,
  auto_accept_orders boolean not null default false,
  estimated_prep_time int not null default 20, -- minutes
  max_concurrent_orders int not null default 50,
  new_order_sound boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger outlet_settings_updated_at
  before update on public.outlet_settings
  for each row execute function public.update_updated_at();

-- Auto-create outlet settings when outlet is created
create or replace function public.handle_new_outlet_settings()
returns trigger as $$
begin
  insert into public.outlet_settings (outlet_id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_outlet_created_settings
  after insert on public.outlets
  for each row execute function public.handle_new_outlet_settings();

-- Create settings for existing outlets
insert into public.outlet_settings (outlet_id)
select id from public.outlets
on conflict do nothing;

-- Order delivery codes
-- Stores verification codes for order pickup
alter table public.orders add column if not exists delivery_code text;

-- Generate delivery code on order creation
create or replace function public.generate_delivery_code()
returns trigger as $$
begin
  new.delivery_code := lpad(floor(random() * 10000)::text, 4, '0');
  return new;
end;
$$ language plpgsql;

create trigger orders_generate_delivery_code
  before insert on public.orders
  for each row execute function public.generate_delivery_code();

-- RLS for new tables
alter table public.outlet_staff enable row level security;
alter table public.outlet_settings enable row level security;

-- Outlet staff: staff can see their own assignments, admins see all
create policy "outlet_staff: own assignments" on public.outlet_staff
  for select using (auth.uid() = user_id);

create policy "outlet_staff: admin all" on public.outlet_staff
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin'))
  );

-- Outlet settings: staff of outlet can read, admins can read/write
create policy "outlet_settings: staff read" on public.outlet_settings
  for select using (
    exists (select 1 from outlet_staff where outlet_id = outlet_settings.outlet_id and user_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin'))
  );

create policy "outlet_settings: admin write" on public.outlet_settings
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin'))
  );

-- Allow outlet staff to update outlet_settings for their outlet
create policy "outlet_settings: staff update" on public.outlet_settings
  for update using (
    exists (select 1 from outlet_staff where outlet_id = outlet_settings.outlet_id and user_id = auth.uid() and is_manager = true)
  );
