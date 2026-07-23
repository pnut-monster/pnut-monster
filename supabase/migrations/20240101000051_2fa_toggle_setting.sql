-- Add a setting to allow admins to toggle 2FA requirement on/off
insert into public.app_settings (key, value) values
  ('require_2fa', 'true')
on conflict (key) do nothing;
