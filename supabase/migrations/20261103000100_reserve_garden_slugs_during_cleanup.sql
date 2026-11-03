begin;

alter table public.gardens add column storage_prefix text;
update public.gardens set storage_prefix = 'hortus/' || slug || '/';
alter table public.gardens
  alter column storage_prefix set not null,
  add constraint gardens_storage_prefix_key unique (storage_prefix),
  add constraint gardens_storage_prefix_format check (
    storage_prefix = 'hortus/' || slug || '/'
    or storage_prefix = 'hortus-v2/' || slug || '/' || id::text || '/'
  );

create table public.garden_deletions (
  garden_id uuid primary key,
  slug text not null,
  storage_prefix text not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  constraint garden_deletions_storage_prefix_format check (
    storage_prefix = 'hortus/' || slug || '/'
    or storage_prefix = 'hortus-v2/' || slug || '/' || garden_id::text || '/'
  )
);

create unique index garden_deletions_reserved_slug
  on public.garden_deletions (slug)
  where completed_at is null;

alter table public.garden_deletions enable row level security;
revoke all on public.garden_deletions from public, anon, authenticated;
grant select, insert, update on public.garden_deletions to service_role;

create function public.prevent_garden_storage_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id, new.slug, new.storage_prefix) is distinct from (old.id, old.slug, old.storage_prefix) then
    raise exception 'garden storage identity cannot be changed';
  end if;
  return new;
end;
$$;

create trigger gardens_prevent_storage_identity_change
  before update on public.gardens
  for each row execute function public.prevent_garden_storage_identity_change();

create function public.reserve_garden_storage_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('garden-slug:' || new.slug, 0));

  if exists (
    select 1 from public.garden_deletions as job
    where job.slug = new.slug and job.completed_at is null
  ) then
    raise exception 'Garden slug cleanup is pending';
  end if;

  -- Support a previous application deployment while the migration rolls out.
  new.storage_prefix := coalesce(new.storage_prefix, 'hortus/' || new.slug || '/');
  return new;
end;
$$;

create trigger gardens_reserve_storage_identity
  before insert on public.gardens
  for each row execute function public.reserve_garden_storage_identity();

create or replace function public.add_garden_creator_as_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.garden_members (garden_id, user_id, can_upload, can_delete, role)
  values (new.id, new.created_by, true, true, 'owner')
  on conflict (garden_id, user_id)
  do update set can_upload = true, can_delete = true, role = 'owner';

  return new;
end;
$$;

create or replace trigger gardens_add_creator_as_owner
  after insert on public.gardens
  for each row execute function public.add_garden_creator_as_owner();

create function public.create_garden_with_slug_reservation(p_name text, p_slug text, p_user_id uuid)
returns table (id uuid, slug text)
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  return query
    insert into public.gardens as garden (id, slug, name, created_by, storage_prefix)
    values (new_id, p_slug, p_name, p_user_id, 'hortus-v2/' || p_slug || '/' || new_id::text || '/')
    returning garden.id, garden.slug;
end;
$$;

create function public.begin_garden_deletion(p_garden_id uuid, p_user_id uuid)
returns table (slug text, member_ids uuid[])
language plpgsql
set search_path = ''
as $$
declare
  target public.gardens%rowtype;
begin
  select garden.* into target from public.gardens as garden where garden.id = p_garden_id;
  if not found then
    raise exception 'Garden not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('garden-slug:' || target.slug, 0));

  select garden.* into target
  from public.gardens as garden
  where garden.id = p_garden_id
  for update;
  if not found then
    raise exception 'Garden not found';
  end if;

  perform 1 from public.garden_members as member
  where member.garden_id = p_garden_id and member.user_id = p_user_id and member.role = 'owner'
  for update;
  if not found then
    raise exception 'Not a garden owner';
  end if;

  select array_agg(member.user_id) into member_ids
  from public.garden_members as member
  where member.garden_id = p_garden_id;

  insert into public.garden_deletions (garden_id, slug, storage_prefix)
  values (target.id, target.slug, target.storage_prefix);

  delete from public.gardens as garden where garden.id = p_garden_id;
  slug := target.slug;
  return next;
end;
$$;

create function public.rotate_garden_public_link(p_garden_id uuid, p_user_id uuid, p_token text)
returns setof public.garden_public_links
language plpgsql
set search_path = ''
as $$
declare
  rotated public.garden_public_links%rowtype;
  previous_upload boolean;
  previous_delete boolean;
begin
  perform 1 from public.gardens where id = p_garden_id for update;
  if not found then
    raise exception 'Garden not found';
  end if;

  perform 1 from public.garden_members
  where garden_id = p_garden_id and user_id = p_user_id and role = 'owner'
  for update;
  if not found then
    raise exception 'Not a garden owner';
  end if;

  delete from public.garden_public_links where garden_id = p_garden_id
  returning can_upload, can_delete into previous_upload, previous_delete;

  insert into public.garden_public_links (garden_id, created_by, token, enabled, can_upload, can_delete)
  values (p_garden_id, p_user_id, p_token, true, coalesce(previous_upload, false), coalesce(previous_delete, false))
  returning * into rotated;

  return next rotated;
end;
$$;

create function public.redeem_garden_public_link(p_token text, p_user_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  link public.garden_public_links%rowtype;
begin
  select * into link
  from public.garden_public_links
  where token = p_token and enabled
  for update;

  if not found then
    return null;
  end if;

  insert into public.garden_public_visitors (public_link_id, user_id)
  values (link.id, p_user_id)
  on conflict (public_link_id, user_id) do nothing;

  return link.garden_id;
end;
$$;

revoke execute on function public.prevent_garden_storage_identity_change() from public, anon, authenticated;
revoke execute on function public.reserve_garden_storage_identity() from public, anon, authenticated;
revoke execute on function public.add_garden_creator_as_owner() from public, anon, authenticated;
revoke execute on function public.create_garden_with_slug_reservation(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.begin_garden_deletion(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rotate_garden_public_link(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.redeem_garden_public_link(text, uuid) from public, anon, authenticated;
grant execute on function public.create_garden_with_slug_reservation(text, text, uuid) to service_role;
grant execute on function public.begin_garden_deletion(uuid, uuid) to service_role;
grant execute on function public.rotate_garden_public_link(uuid, uuid, text) to service_role;
grant execute on function public.redeem_garden_public_link(text, uuid) to service_role;

commit;
