-- Local development bootstrap for data that is required before the app is usable.
-- This is intentionally idempotent and should only be applied to local/dev DBs.

-- Ensure active outlets exist even when a DB was restored without seed data.
insert into public.outlets (name, slug, address, city, state, pincode, latitude, longitude, phone, is_active)
values
  ('PNUT MONSTER - Koramangala', 'koramangala', '123 80 Feet Road, Koramangala 4th Block', 'Bangalore', 'Karnataka', '560034', 12.9352, 77.6245, '+919876543210', true),
  ('PNUT MONSTER - Indiranagar', 'indiranagar', '45 100 Feet Road, Indiranagar', 'Bangalore', 'Karnataka', '560038', 12.9784, 77.6408, '+919876543211', true),
  ('PNUT MONSTER - HSR Layout', 'hsr-layout', '78 27th Main, HSR Layout Sector 1', 'Bangalore', 'Karnataka', '560102', 12.9116, 77.6389, '+919876543212', true),
  ('PNUT MONSTER - Whitefield', 'whitefield', '56 ITPL Main Road, Whitefield', 'Bangalore', 'Karnataka', '560066', 12.9698, 77.7500, '+919876543213', true),
  ('PNUT MONSTER - JP Nagar', 'jp-nagar', '34 15th Cross, JP Nagar 6th Phase', 'Bangalore', 'Karnataka', '560078', 12.8891, 77.5854, '+919876543214', true)
on conflict (slug) do update
set
  name = excluded.name,
  address = excluded.address,
  city = excluded.city,
  state = excluded.state,
  pincode = excluded.pincode,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  phone = excluded.phone,
  is_active = true,
  updated_at = now();

-- Ensure known local admin accounts exist. Password is for local development only.
do $$
declare
  v_email text;
  v_user_id uuid;
  v_password text := 'PnutMonster@12345';
begin
  alter table public.profiles disable trigger trg_prevent_profile_privilege_escalation;

  foreach v_email in array array['admin@pnutmonster.com', 'admin@pnut.monster'] loop
    select id into v_user_id from auth.users where lower(email) = v_email;

    if v_user_id is null then
      v_user_id := gen_random_uuid();

      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change,
        email_change_token_current,
        phone_change,
        phone_change_token,
        reauthentication_token,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        v_email,
        crypt(v_password, gen_salt('bf')),
        now(),
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '{"provider":"email","providers":["email"],"role":"super_admin"}'::jsonb,
        '{"full_name":"Company Admin"}'::jsonb,
        now(),
        now()
      );
    else
      update auth.users
      set
        encrypted_password = crypt(v_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        confirmation_token = coalesce(confirmation_token, ''),
        recovery_token = coalesce(recovery_token, ''),
        email_change_token_new = coalesce(email_change_token_new, ''),
        email_change = coalesce(email_change, ''),
        email_change_token_current = coalesce(email_change_token_current, ''),
        phone_change = coalesce(phone_change, ''),
        phone_change_token = coalesce(phone_change_token, ''),
        reauthentication_token = coalesce(reauthentication_token, ''),
        raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
          || '{"provider":"email","providers":["email"],"role":"super_admin"}'::jsonb,
        updated_at = now()
      where id = v_user_id;
    end if;

    insert into auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      v_user_id::text,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email',
      now(),
      now(),
      now()
    )
    on conflict (provider_id, provider) do update
    set
      identity_data = excluded.identity_data,
      updated_at = now();

    insert into public.profiles (id, email, full_name, role)
    values (v_user_id, v_email, 'Company Admin', 'super_admin')
    on conflict (id) do update
    set
      email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      role = 'super_admin',
      updated_at = now();
  end loop;

  alter table public.profiles enable trigger trg_prevent_profile_privilege_escalation;
exception
  when others then
    alter table public.profiles enable trigger trg_prevent_profile_privilege_escalation;
    raise;
end $$;
