create or replace function public.prevent_item_garden_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.garden_id is distinct from old.garden_id
    and (
      old.type <> 'file'
      or coalesce(current_setting('app.allow_cross_garden_file_move', true), '') <> 'on'
    )
  then
    raise exception 'items cannot be moved across gardens';
  end if;

  return new;
end;
$$;

create or replace function public.internal_move_file_record(
  p_item_id uuid,
  p_target_garden_id uuid,
  p_target_parent_id uuid,
  p_new_s3_key text,
  p_new_thumbnail_key text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  perform set_config('app.allow_cross_garden_file_move', 'on', true);

  update public.items
  set
    garden_id = p_target_garden_id,
    parent_id = p_target_parent_id,
    s3_key = p_new_s3_key,
    thumbnail_key = p_new_thumbnail_key
  where id = p_item_id
    and type = 'file';

  if not found then
    raise exception 'file not found';
  end if;
end;
$$;

revoke execute on function public.internal_move_file_record(
  uuid,
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.internal_move_file_record(
  uuid,
  uuid,
  uuid,
  text,
  text
) to service_role;
