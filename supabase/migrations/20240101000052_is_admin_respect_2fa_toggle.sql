-- Update is_admin() to respect the require_2fa toggle.
-- When 2FA is disabled, AAL1 sessions are allowed for admin operations.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    case
      when coalesce((select value from public.app_settings where key = 'require_2fa'), 'true') = 'false'
        then true
      else coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
    end
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and role in ('admin', 'super_admin')
    );
$$;
