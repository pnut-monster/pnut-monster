-- Authoritative preflight validation for checkout rules that were previously
-- enforced only by the client/API preview.

alter function public.place_order_with_wallet(jsonb, jsonb[], numeric, integer, numeric)
  rename to place_order_with_wallet_validated_impl;

revoke execute on function public.place_order_with_wallet_validated_impl(jsonb, jsonb[], numeric, integer, numeric)
  from public, anon, authenticated;

create function public.place_order_with_wallet(
  p_order jsonb,
  p_items jsonb[],
  p_wallet_amount numeric default 0,
  p_loyalty_points integer default 0,
  p_nth_order_discount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_outlet_id uuid := (p_order->>'outlet_id')::uuid;
  v_coupon_code text := nullif(upper(trim(coalesce(p_order->>'coupon_code', ''))), '');
  v_coupon coupons%rowtype;
  v_group record;
  v_group_rows integer;
  v_option_count integer;
  v_distinct_option_count integer;
  v_usage_count integer;
  v_order_count integer;
  v_max_redemption jsonb;
  v_customer_eligibility text;
  v_student_verified boolean;
  v_authoritative_subtotal numeric := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from outlets
    where id = v_outlet_id
      and is_active = true
      and coalesce(is_manually_closed, false) = false
  ) then
    raise exception 'Outlet is closed or unavailable';
  end if;

  -- Enforce every active customization group against the submitted item JSON.
  for v_group in
    select g.id, g.item_id, g.name, g.is_required, g.min_select, g.max_select
    from item_customization_groups g
    where g.item_id in (
      select (item->>'item_id')::uuid from unnest(p_items) item
    )
  loop
    select count(*) into v_group_rows
    from unnest(p_items) submitted_item
    cross join lateral jsonb_array_elements(coalesce(submitted_item->'customizations', '[]'::jsonb)) chosen_group
    where (submitted_item->>'item_id')::uuid = v_group.item_id
      and (chosen_group->>'group_id')::uuid = v_group.id;

    select count(*), count(distinct chosen_option->>'id')
    into v_option_count, v_distinct_option_count
    from unnest(p_items) submitted_item
    cross join lateral jsonb_array_elements(coalesce(submitted_item->'customizations', '[]'::jsonb)) chosen_group
    cross join lateral jsonb_array_elements(coalesce(chosen_group->'options', '[]'::jsonb)) chosen_option
    where (submitted_item->>'item_id')::uuid = v_group.item_id
      and (chosen_group->>'group_id')::uuid = v_group.id;

    if v_group_rows > 1 then
      raise exception 'Duplicate customization group: %', v_group.name;
    end if;
    if v_option_count <> v_distinct_option_count then
      raise exception 'Duplicate customization option: %', v_group.name;
    end if;
    if v_group.is_required and v_option_count < v_group.min_select then
      raise exception 'Required customization is incomplete: %', v_group.name;
    end if;
    if not v_group.is_required and v_option_count > 0 and v_option_count < v_group.min_select then
      raise exception 'Customization minimum is not met: %', v_group.name;
    end if;
    if v_option_count > v_group.max_select then
      raise exception 'Too many customization options: %', v_group.name;
    end if;
  end loop;

  if v_coupon_code is not null then
    select * into v_coupon
    from coupons
    where upper(code) = v_coupon_code
    for update;

    if not found or not v_coupon.is_active
       or v_coupon.starts_at > now() or v_coupon.ends_at <= now()
       or coalesce(v_coupon.status, 'active') not in ('active', 'scheduled') then
      raise exception 'Coupon is not active';
    end if;

    if coalesce(v_coupon.discount_type_ext, v_coupon.discount_type) not in ('percentage', 'flat', 'fixed') then
      raise exception 'Coupon type is not supported by checkout';
    end if;

    if v_coupon.per_user_limit is not null then
      select count(*) into v_usage_count from coupon_usage
      where coupon_id = v_coupon.id and user_id = v_user_id;
      if v_usage_count >= v_coupon.per_user_limit then
        raise exception 'Coupon per-user limit reached';
      end if;
    end if;

    if v_coupon.daily_limit is not null then
      select count(*) into v_usage_count from coupon_usage
      where coupon_id = v_coupon.id and created_at >= current_date;
      if v_usage_count >= v_coupon.daily_limit then
        raise exception 'Coupon daily limit reached';
      end if;
    end if;

    if exists (select 1 from coupon_outlet_restrictions where coupon_id = v_coupon.id)
       and not exists (
         select 1 from coupon_outlet_restrictions
         where coupon_id = v_coupon.id and outlet_id = v_outlet_id
       ) then
      raise exception 'Coupon is not valid at this outlet';
    end if;

    if v_coupon.applicable_type = 'products'
       and not exists (
         select 1 from unnest(p_items) item
         where (item->>'item_id')::uuid = any(v_coupon.applicable_product_ids)
       ) then
      raise exception 'Coupon is not valid for these products';
    end if;

    if v_coupon.applicable_type = 'categories'
       and not exists (
         select 1
         from unnest(p_items) item
         join menu_items mi on mi.id = (item->>'item_id')::uuid
         join menu_subcategories ms on ms.id = mi.subcategory_id
         where ms.category_id = any(v_coupon.applicable_category_ids)
       ) then
      raise exception 'Coupon is not valid for these categories';
    end if;

    v_customer_eligibility := coalesce(v_coupon.customer_eligibility, 'all');
    select count(*) into v_order_count from orders where user_id = v_user_id;
    if v_customer_eligibility = 'new' and v_order_count > 0 then
      raise exception 'Coupon is only for new customers';
    elsif v_customer_eligibility = 'existing' and v_order_count = 0 then
      raise exception 'Coupon is only for existing customers';
    elsif v_customer_eligibility = 'premium' and not exists (
      select 1 from membership_cycles
      where user_id = v_user_id and is_active = true and current_tier in ('sprout_hero', 'pnut_legend')
    ) then
      raise exception 'Coupon requires premium membership';
    elsif v_customer_eligibility = 'student' then
      select coalesce((raw_user_meta_data->>'student_verified')::boolean, false)
      into v_student_verified from auth.users where id = v_user_id;
      if not coalesce(v_student_verified, false) then
        raise exception 'Coupon requires verified student status';
      end if;
    end if;
  end if;

  if coalesce(p_loyalty_points, 0) > 0 then
    select coalesce(sum(
      (coalesce(omi.price_override, mi.base_price) + coalesce((
        select sum(co.price)
        from jsonb_array_elements(coalesce(item->'customizations', '[]'::jsonb)) selected_group
        cross join lateral jsonb_array_elements(coalesce(selected_group->'options', '[]'::jsonb)) selected_option
        join customization_options co on co.id = (selected_option->>'id')::uuid
        where co.is_active = true
      ), 0)) * greatest(1, least(coalesce((item->>'quantity')::integer, 1), 99))
    ), 0)
    into v_authoritative_subtotal
    from unnest(p_items) item
    join menu_items mi on mi.id = (item->>'item_id')::uuid
    left join outlet_menu_items omi on omi.item_id = mi.id and omi.outlet_id = v_outlet_id;

    v_max_redemption := calculate_max_redeemable_points(
      v_user_id,
      v_authoritative_subtotal,
      0,
      0,
      v_coupon_code is not null,
      false
    );
    if not coalesce((v_max_redemption->>'eligible')::boolean, false)
       or p_loyalty_points > coalesce((v_max_redemption->>'max_points')::integer, 0) then
      raise exception 'Loyalty redemption exceeds the allowed limit';
    end if;
  end if;

  return place_order_with_wallet_validated_impl(
    p_order, p_items, p_wallet_amount, p_loyalty_points, p_nth_order_discount
  );
end;
$$;

revoke execute on function public.place_order_with_wallet(jsonb, jsonb[], numeric, integer, numeric)
  from public, anon;
grant execute on function public.place_order_with_wallet(jsonb, jsonb[], numeric, integer, numeric)
  to authenticated;
