-- Ensure the known company owner/admin accounts are not left as customers.
-- Auth signups create profiles as customer by default, so these explicit
-- accounts need a versioned bootstrap step for fresh and restored databases.

do $$
begin
  alter table public.profiles disable trigger trg_prevent_profile_privilege_escalation;

  with company_admins(email) as (
    values
      ('admin@pnut.monster'),
      ('admin@pnutmonster.com')
  ),
  matching_users as (
    select
      u.id,
      lower(u.email) as email,
      coalesce(u.raw_user_meta_data->>'full_name', 'Company Admin') as full_name
    from auth.users u
    join company_admins a on lower(u.email) = a.email
  )
  insert into public.profiles (id, email, full_name, role)
  select id, email, full_name, 'super_admin'
  from matching_users
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name),
    role = 'super_admin',
    updated_at = now();

  alter table public.profiles enable trigger trg_prevent_profile_privilege_escalation;
exception
  when others then
    alter table public.profiles enable trigger trg_prevent_profile_privilege_escalation;
    raise;
end $$;

with company_admins(email) as (
  values
    ('admin@pnut.monster'),
    ('admin@pnutmonster.com')
)
update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || '{"role":"super_admin"}'::jsonb
from company_admins a
where lower(u.email) = a.email;
