-- Add pickup OTP setting (optional for outlet)
insert into public.app_settings (key, value) values
  ('pickup_otp_required', 'true');
