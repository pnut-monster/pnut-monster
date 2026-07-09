-- Fix: grant table-level privileges and EXECUTE on helper functions.
--
-- The authenticated and anon roles lost SELECT/INSERT/UPDATE/DELETE on all
-- public tables (likely due to missing default privilege grants or an
-- accidental revoke). RLS policies cannot be evaluated unless the role has
-- the base table privilege first. This migration restores the standard
-- Supabase privilege model: both roles get full DML access, and RLS
-- policies control row-level visibility.
--
-- Additionally, migration 000033 revoked all function privileges from
-- authenticated/public but forgot to re-grant helpers that RLS policies
-- invoke implicitly (is_admin, can_manage_order, etc.).

-- =========================================================================
-- 1. Table-level DML grants for authenticated and anon
-- =========================================================================
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to service_role;

-- Ensure future tables also get these grants
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;

-- Sequences (needed for serial/identity columns)
grant usage, select on all sequences in schema public to authenticated;
grant usage, select on all sequences in schema public to anon;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant usage, select on sequences to anon;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- =========================================================================
-- 2. Function EXECUTE grants for RLS policy helpers
-- =========================================================================
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to anon;
grant execute on function public.is_outlet_staff_for_order(uuid) to authenticated;
grant execute on function public.can_manage_order(uuid) to authenticated;
grant execute on function public.is_outlet_staff_for_outlet(uuid) to authenticated;
