-- Admin audit log for security-sensitive operations
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  ip_address text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index idx_admin_audit_log_admin_id on public.admin_audit_log(admin_id);
create index idx_admin_audit_log_created_at on public.admin_audit_log(created_at desc);

alter table public.admin_audit_log enable row level security;

create policy "Admins can view audit logs"
  on public.admin_audit_log for select
  using (public.is_admin());
