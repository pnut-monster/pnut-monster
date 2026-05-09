-- Profiles table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  phone text,
  email text,
  full_name text,
  avatar_url text,
  role text not null default 'customer' check (role in ('customer', 'admin', 'super_admin', 'outlet_staff')),
  referral_code text unique,
  referred_by uuid references public.profiles(id),
  date_of_birth date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, phone, email, full_name, referral_code)
  values (
    new.id,
    new.phone,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', null),
    upper(substr(md5(new.id::text), 1, 8))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated_at trigger
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- Indexes
create index idx_profiles_phone on public.profiles(phone);
create index idx_profiles_referral_code on public.profiles(referral_code);
create index idx_profiles_role on public.profiles(role);
