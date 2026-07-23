-- Add settings for 2FA toggle and MFA user email
insert into public.app_settings (key, value) values
  ('require_2fa', 'true'),
  ('mfa_user_email', '')
on conflict (key) do nothing;
