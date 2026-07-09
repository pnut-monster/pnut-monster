-- Add manual close/open override for outlets
alter table public.outlets
  add column is_manually_closed boolean not null default false,
  add column manual_close_reason text;
