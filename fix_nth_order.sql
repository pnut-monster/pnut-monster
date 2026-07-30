-- 1. Check if the feature is enabled
SELECT key, value FROM app_settings WHERE key LIKE 'nth_order%';

-- 2. Enable it if it's disabled or missing
INSERT INTO app_settings (key, value) VALUES
  ('nth_order_discount_enabled', 'true'),
  ('nth_order_interval', '5'),
  ('nth_order_discount_pct', '10'),
  ('nth_order_stack_with_loyalty', 'true')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;

-- 3. Apply the wallet amount fix (from migration 0062)
DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'public.place_order_with_wallet_validated_impl(jsonb,jsonb[],numeric,integer,numeric)'::regprocedure
  ) INTO v_definition;

  IF v_definition LIKE '%if v_wallet_amount < 0 or v_wallet_amount > v_total then%' THEN
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
    EXECUTE v_definition;
  END IF;
END;
$migration$;

-- 4. Ensure the RPC grant is in place
GRANT EXECUTE ON FUNCTION public.check_nth_order_discount(uuid) TO authenticated;

-- 5. Verify eligible users exist (shows users whose next order qualifies)
SELECT user_id, count(*) as completed_orders
FROM orders WHERE status = 'picked_up'
GROUP BY user_id
HAVING (count(*) + 1) % 5 = 0;
