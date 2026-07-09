-- App settings table (key-value store for admin-configurable settings)
create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Seed default values
insert into public.app_settings (key, value) values
  ('tax_rate', '0.05'),
  ('packaging_charge', '10'),
  ('packaging_mode', 'per_order');

-- Allow public read access (needed by customer pages)
alter table public.app_settings enable row level security;

create policy "Anyone can read app_settings"
  on public.app_settings for select
  using (true);

create policy "Admins can update app_settings"
  on public.app_settings for update
  using (true);
