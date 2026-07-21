-- Add manual close/open override for outlets
alter table public.outlets
  add column if not exists is_manually_closed boolean not null default false,
  add column if not exists manual_close_reason text;
