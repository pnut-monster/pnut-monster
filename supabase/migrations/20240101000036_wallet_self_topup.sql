-- Self-service wallet top-up (for Razorpay-verified payments)
-- Called server-side after payment verification, uses service role

create or replace function public.self_topup_wallet(
  p_user_id uuid,
  p_amount numeric,
  p_razorpay_payment_id text,
  p_razorpay_order_id text
)
returns jsonb as $$
declare
  v_wallet wallets%rowtype;
  v_new_loaded numeric;
  v_auth_uid uuid;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    raise exception 'Authentication required';
  end if;

  if v_auth_uid <> p_user_id and not public.is_admin() then
    raise exception 'Cannot top up another user wallet';
  end if;

  if p_amount <= 0 then
    raise exception 'Invalid top-up amount';
  end if;

  select * into v_wallet from wallets where user_id = p_user_id for update;

  if not found then
    insert into wallets (user_id, loaded_balance, bonus_balance)
    values (p_user_id, 0, 0)
    returning * into v_wallet;
  end if;

  v_new_loaded := v_wallet.loaded_balance + p_amount;

  update wallets
  set loaded_balance = v_new_loaded,
      updated_at = now()
  where id = v_wallet.id;

  insert into wallet_transactions (wallet_id, type, amount, balance_after, description, reference_id)
  values (v_wallet.id, 'topup', p_amount, v_new_loaded + v_wallet.bonus_balance,
          'Wallet top-up via Razorpay', p_razorpay_payment_id);

  return jsonb_build_object(
    'success', true,
    'loaded_balance', v_new_loaded,
    'bonus_balance', v_wallet.bonus_balance,
    'total_balance', v_new_loaded + v_wallet.bonus_balance
  );
end;
$$ language plpgsql security definer;

grant execute on function public.self_topup_wallet(uuid, numeric, text, text) to authenticated;
