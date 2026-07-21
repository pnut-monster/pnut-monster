-- Customer saved addresses and support tickets.

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Home' check (char_length(label) between 1 and 30),
  recipient_name text not null check (char_length(recipient_name) between 1 and 100),
  phone text not null check (phone ~ '^[0-9+ -]{7,20}$'),
  address_line_1 text not null check (char_length(address_line_1) between 3 and 200),
  address_line_2 text,
  landmark text,
  city text not null check (char_length(city) between 2 and 100),
  state text not null check (char_length(state) between 2 and 100),
  pincode text not null check (pincode ~ '^[0-9]{6}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index customer_addresses_one_default
  on public.customer_addresses(user_id) where is_default;
create index customer_addresses_user_id_idx on public.customer_addresses(user_id);

create or replace function public.ensure_customer_address_default()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_default then
    update public.customer_addresses
      set is_default = false
      where user_id = new.user_id and id <> new.id and is_default;
  elsif not exists (
    select 1 from public.customer_addresses
    where user_id = new.user_id and id <> new.id
  ) then
    new.is_default := true;
  end if;
  return new;
end;
$$;

create trigger customer_addresses_default_before_write
  before insert or update on public.customer_addresses
  for each row execute function public.ensure_customer_address_default();
create trigger customer_addresses_updated_at
  before update on public.customer_addresses
  for each row execute function public.update_updated_at();

alter table public.customer_addresses enable row level security;
create policy "customer addresses: own select" on public.customer_addresses
  for select using (auth.uid() = user_id);
create policy "customer addresses: own insert" on public.customer_addresses
  for insert with check (auth.uid() = user_id);
create policy "customer addresses: own update" on public.customer_addresses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "customer addresses: own delete" on public.customer_addresses
  for delete using (auth.uid() = user_id);
create policy "customer addresses: admin all" on public.customer_addresses
  for all using (public.is_admin()) with check (public.is_admin());

create sequence public.support_ticket_number_seq start 1001;
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number text not null unique default ('PM-' || nextval('public.support_ticket_number_seq')::text),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('order', 'payment', 'wallet', 'account', 'feedback', 'other')),
  subject text not null check (char_length(subject) between 3 and 120),
  message text not null check (char_length(message) between 10 and 2000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  admin_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user_id_idx on public.support_tickets(user_id, created_at desc);
create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function public.update_updated_at();

alter table public.support_tickets enable row level security;
create policy "support tickets: own select" on public.support_tickets
  for select using (auth.uid() = user_id);
create policy "support tickets: own insert" on public.support_tickets
  for insert with check (auth.uid() = user_id and status = 'open' and admin_response is null);
create policy "support tickets: admin all" on public.support_tickets
  for all using (public.is_admin()) with check (public.is_admin());

grant usage on sequence public.support_ticket_number_seq to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
grant select, insert on public.support_tickets to authenticated;
