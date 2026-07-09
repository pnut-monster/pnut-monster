create or replace function public.apply_referral_code(p_referral_code text)
returns jsonb as $$
declare
  v_referrer_id uuid;
  v_current_referred_by uuid;
  v_code text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'message', 'Not authenticated');
  end if;

  v_code := upper(trim(coalesce(p_referral_code, '')));

  if v_code = '' then
    return jsonb_build_object('success', true, 'message', 'No referral code provided');
  end if;

  select id
  into v_referrer_id
  from public.profiles
  where upper(referral_code) = v_code
  limit 1;

  if v_referrer_id is null then
    return jsonb_build_object('success', false, 'message', 'Invalid referral code');
  end if;

  if v_referrer_id = auth.uid() then
    return jsonb_build_object('success', false, 'message', 'You cannot use your own referral code');
  end if;

  select referred_by
  into v_current_referred_by
  from public.profiles
  where id = auth.uid();

  if v_current_referred_by is not null then
    return jsonb_build_object('success', true, 'message', 'Referral code already applied');
  end if;

  update public.profiles
  set referred_by = v_referrer_id
  where id = auth.uid()
    and referred_by is null;

  return jsonb_build_object('success', true, 'message', 'Referral code applied');
end;
$$ language plpgsql security definer set search_path = public;
