-- Require a verified second factor for every database operation authorized by
-- the shared admin helper. Self-profile reads remain available at AAL1 so the
-- application can confirm the role before sending an admin through MFA.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1
      from public.profiles
      where id = (select auth.uid())
        and role in ('admin', 'super_admin')
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
