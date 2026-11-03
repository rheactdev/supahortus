begin;

alter table public.items
  add column card_thumbnail_key text,
  drop constraint items_status_check,
  add constraint items_status_check check (status in ('pending', 'ready', 'deleting'));

create function public.internal_relocate_file_record(
  p_item_id uuid,
  p_source_garden_id uuid,
  p_target_garden_id uuid,
  p_target_parent_id uuid,
  p_old_s3_key text,
  p_old_thumbnail_key text,
  p_old_card_thumbnail_key text,
  p_new_s3_key text,
  p_new_thumbnail_key text,
  p_new_card_thumbnail_key text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('app.allow_cross_garden_file_move', 'on', true);

  update public.items
  set
    garden_id = p_target_garden_id,
    parent_id = p_target_parent_id,
    s3_key = p_new_s3_key,
    thumbnail_key = p_new_thumbnail_key,
    card_thumbnail_key = p_new_card_thumbnail_key
  where id = p_item_id
    and type = 'file'
    and status = 'ready'
    and garden_id = p_source_garden_id
    and s3_key = p_old_s3_key
    and thumbnail_key is not distinct from p_old_thumbnail_key
    and card_thumbnail_key is not distinct from p_old_card_thumbnail_key;

  if not found and not exists (
    select 1
    from public.items
    where id = p_item_id
      and type = 'file'
      and status = 'ready'
      and garden_id = p_target_garden_id
      and parent_id is not distinct from p_target_parent_id
      and s3_key = p_new_s3_key
      and (p_new_thumbnail_key is null or thumbnail_key = p_new_thumbnail_key)
      and (p_new_card_thumbnail_key is null or card_thumbnail_key = p_new_card_thumbnail_key)
  ) then
    raise exception 'file changed during relocation';
  end if;
end;
$$;

revoke execute on function public.internal_relocate_file_record(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.internal_relocate_file_record(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text
) to service_role;

commit;
