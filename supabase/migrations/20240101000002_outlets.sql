create table public.outlets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  address text not null,
  city text not null,
  state text not null,
  pincode text not null,
  latitude double precision not null,
  longitude double precision not null,
  phone text not null,
  image_url text,
  is_active boolean not null default true,
  opens_at time not null default '09:00',
  closes_at time not null default '22:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger outlets_updated_at
  before update on public.outlets
  for each row execute function public.update_updated_at();

create index idx_outlets_city on public.outlets(city);
create index idx_outlets_is_active on public.outlets(is_active);
create index idx_outlets_slug on public.outlets(slug);
