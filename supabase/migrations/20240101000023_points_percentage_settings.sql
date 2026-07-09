-- Points percentage settings for wallet_topup and order_placed actions
insert into public.app_settings (key, value) values
  ('points_pct_wallet_topup', '2'),
  ('points_pct_order_placed', '5');
