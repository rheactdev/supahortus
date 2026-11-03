begin;

alter table public.items
  add column if not exists preview_key text,
  add column if not exists preview_status text,
  add column if not exists preview_error text;

alter table public.items
  drop constraint if exists items_preview_status_check;

alter table public.items
  add constraint items_preview_status_check
  check (
    preview_status is null
    or preview_status in ('pending', 'ready', 'failed')
  );

create index if not exists idx_items_office_preview_pending
  on public.items (preview_status, updated_at)
  where preview_status = 'pending';

commit;
