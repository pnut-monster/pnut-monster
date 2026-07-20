-- Enforce the admin/super-admin boundary in the database.
-- API checks are not sufficient because authenticated clients can call
-- PostgREST directly under the profiles admin update policy.

create or replace function public.prevent_profile_privilege_escalation()
returns trigger as $$
declare
  v_caller_role text;
  v_jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    current_setting('role', true)
  );
begin
  if old.id is distinct from new.id then
    raise exception 'Profile id cannot be changed';
  end if;

  -- Service-role operations are trusted server-side provisioning tasks.
  if v_jwt_role = 'service_role' then
    return new;
  end if;

  select role into v_caller_role
  from public.profiles
  where id = auth.uid();

  if old.role is distinct from new.role then
    -- Any transition into or out of an elevated role requires super-admin.
    -- Ordinary admins may still manage customer <-> outlet_staff changes.
    if old.role in ('admin', 'super_admin')
       or new.role in ('admin', 'super_admin') then
      if v_caller_role is distinct from 'super_admin' then
        raise exception 'Super admin access required for elevated role changes';
      end if;
    elsif coalesce(v_caller_role, '') not in ('admin', 'super_admin') then
      raise exception 'Profile role cannot be changed by this user';
    end if;
  end if;

  if old.referral_code is distinct from new.referral_code
     and coalesce(v_caller_role, '') not in ('admin', 'super_admin') then
    raise exception 'Referral code cannot be changed by this user';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Trigger functions should never be directly callable through the API.
revoke execute on function public.prevent_profile_privilege_escalation()
  from public, anon, authenticated;
