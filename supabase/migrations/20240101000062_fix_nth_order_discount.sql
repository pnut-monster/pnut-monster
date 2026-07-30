-- Fix nth order discount: cap wallet amount at v_total instead of rejecting,
-- so server-applied discounts that the client didn't predict don't cause failures.
-- Also ensure the check_nth_order_discount grant is in place.

do $migration$
declare
  v_definition text;
begin
  -- Patch the validated_impl function (the inner function that does the actual work)
  select pg_get_functiondef(
    'public.place_order_with_wallet_validated_impl(jsonb,jsonb[],numeric,integer,numeric)'::regprocedure
  ) into v_definition;

  -- Replace the strict wallet amount check with a cap
  if v_definition like '%if v_wallet_amount < 0 or v_wallet_amount > v_total then%' then
    v_definition := replace(
      v_definition,
      $old$if v_wallet_amount < 0 or v_wallet_amount > v_total then
    raise exception 'Invalid wallet amount';
  end if;$old$,
      $new$if v_wallet_amount < 0 then
    raise exception 'Invalid wallet amount';
  end if;
  -- Cap wallet usage at the computed total (handles server-side discount mismatches)
  v_wallet_amount := least(v_wallet_amount, v_total);$new$
    );
    execute v_definition;
  end if;
end;
$migration$;

-- Ensure grant is in place (idempotent)
grant execute on function public.check_nth_order_discount(uuid) to authenticated;
