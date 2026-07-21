-- Remove unintended anonymous wallet access and pin the remaining function path.
alter function public.self_topup_wallet(uuid, numeric, text, text)
  set search_path = public;

revoke execute on function public.self_topup_wallet(uuid, numeric, text, text)
  from public, anon;
grant execute on function public.self_topup_wallet(uuid, numeric, text, text)
  to authenticated;

-- Future functions must be explicitly granted instead of inheriting PUBLIC execute.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
