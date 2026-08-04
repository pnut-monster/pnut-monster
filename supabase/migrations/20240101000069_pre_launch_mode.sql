-- Pre-Launch Mode: temporary ordering lock with countdown, email subscription, and admin controls

-- Settings for pre-launch mode
insert into public.app_settings (key, value) values
  ('pre_launch_enabled', 'true'),
  ('pre_launch_date', '2026-08-15T10:00:00+05:30')
on conflict (key) do nothing;

-- Email subscribers table for launch notifications
create table public.launch_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  subscribed_at timestamptz not null default now(),
  notified_at timestamptz,
  constraint launch_subscribers_email_unique unique (email)
);

alter table public.launch_subscribers enable row level security;

create policy "Anyone can subscribe"
  on public.launch_subscribers for insert
  with check (true);

create policy "Admins can view subscribers"
  on public.launch_subscribers for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'super_admin')
    )
  );

create policy "Admins can update subscribers"
  on public.launch_subscribers for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'super_admin')
    )
  );

create policy "Admins can delete subscribers"
  on public.launch_subscribers for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role in ('admin', 'super_admin')
    )
  );

create index idx_launch_subscribers_email on public.launch_subscribers (email);
create index idx_launch_subscribers_notified on public.launch_subscribers (notified_at) where notified_at is null;
