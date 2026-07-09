-- Order ratings table for user feedback
create table public.order_ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating >= 1 and rating <= 5),
  created_at timestamptz not null default now(),
  unique(order_id, user_id)
);

alter table public.order_ratings enable row level security;

create policy "Users can read own ratings"
  on public.order_ratings for select
  using (auth.uid() = user_id);

create policy "Users can insert own ratings"
  on public.order_ratings for insert
  with check (auth.uid() = user_id);

create policy "Admins can read all ratings"
  on public.order_ratings for select
  using (true);
