begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

alter function public.add_garden_creator_as_owner()
  set search_path = '';
alter function public.update_updated_at()
  set search_path = '';
alter function public.prevent_garden_created_by_change()
  set search_path = '';
alter function public.prevent_item_garden_change()
  set search_path = '';
alter function public.internal_move_file_record(uuid, uuid, uuid, text, text)
  set search_path = '';

create or replace function private.is_garden_member(p_garden_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.garden_members member
      where member.garden_id = p_garden_id
        and member.user_id = (select auth.uid())
    );
$$;

create or replace function private.is_garden_owner(p_garden_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.garden_members member
        where member.garden_id = p_garden_id
          and member.user_id = (select auth.uid())
          and member.role = 'owner'
      )
      or exists (
        select 1
        from public.gardens garden
        where garden.id = p_garden_id
          and garden.created_by = (select auth.uid())
      )
    );
$$;

create or replace function private.has_public_garden_access(
  p_garden_id uuid,
  p_permission text default 'read'
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and p_permission in ('read', 'upload', 'delete')
    and exists (
      select 1
      from public.garden_public_links link
      join public.garden_public_visitors visitor
        on visitor.public_link_id = link.id
      where link.garden_id = p_garden_id
        and link.enabled = true
        and visitor.user_id = (select auth.uid())
        and (
          p_permission = 'read'
          or (p_permission = 'upload' and link.can_upload)
          or (p_permission = 'delete' and link.can_delete)
        )
    );
$$;

create or replace function private.can_read_garden(p_garden_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select private.is_garden_member(p_garden_id)
    or private.is_garden_owner(p_garden_id)
    or private.has_public_garden_access(p_garden_id, 'read');
$$;

create or replace function private.can_upload_to_garden(p_garden_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      private.is_garden_owner(p_garden_id)
      or exists (
        select 1
        from public.garden_members member
        where member.garden_id = p_garden_id
          and member.user_id = (select auth.uid())
          and member.can_upload
      )
      or private.has_public_garden_access(p_garden_id, 'upload')
    );
$$;

create or replace function private.can_delete_from_garden(p_garden_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (
      private.is_garden_owner(p_garden_id)
      or exists (
        select 1
        from public.garden_members member
        where member.garden_id = p_garden_id
          and member.user_id = (select auth.uid())
          and member.can_delete
      )
      or private.has_public_garden_access(p_garden_id, 'delete')
    );
$$;

create or replace function private.is_valid_item_parent(
  p_item_id uuid,
  p_garden_id uuid,
  p_parent_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  with recursive ancestors(id, parent_id, path) as (
    select item.id, item.parent_id, array[item.id]
    from public.items item
    where item.id = p_parent_id

    union all

    select parent.id, parent.parent_id, ancestors.path || parent.id
    from public.items parent
    join ancestors on ancestors.parent_id = parent.id
    where not parent.id = any(ancestors.path)
  )
  select
    p_parent_id is null
    or (
      exists (
        select 1
        from public.items parent
        where parent.id = p_parent_id
          and parent.garden_id = p_garden_id
          and parent.type = 'folder'
          and parent.status = 'ready'
      )
      and not exists (
        select 1
        from ancestors
        where ancestors.id = p_item_id
      )
    );
$$;

create or replace function private.can_write_share(
  p_item_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and p_user_id is not null
    and exists (
      select 1
      from public.items item
      where item.id = p_item_id
        and item.status = 'ready'
        and private.can_upload_to_garden(item.garden_id)
        and (
          p_user_id = (select auth.uid())
          or private.is_garden_owner(item.garden_id)
        )
    );
$$;

create or replace function private.can_manage_share(p_share_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.shares share
      join public.items item on item.id = share.item_id
      where share.id = p_share_id
        and item.status = 'ready'
        and (
          private.is_garden_owner(item.garden_id)
          or (
            share.user_id = (select auth.uid())
            and private.can_upload_to_garden(item.garden_id)
          )
        )
    );
$$;

revoke execute on all functions in schema private
  from public, anon, authenticated, service_role;

alter policy "gardens_select_readable"
on public.gardens
to authenticated
using ((select private.can_read_garden(id)));

alter policy "gardens_update_owner"
on public.gardens
to authenticated
using ((select private.is_garden_owner(id)))
with check ((select private.is_garden_owner(id)));

alter policy "gardens_delete_owner"
on public.gardens
to authenticated
using ((select private.is_garden_owner(id)));

alter policy "garden_members_select_self_or_owner"
on public.garden_members
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_garden_owner(garden_id))
);

alter policy "garden_members_insert_owner"
on public.garden_members
to authenticated
with check ((select private.is_garden_owner(garden_id)));

alter policy "garden_members_update_owner"
on public.garden_members
to authenticated
using ((select private.is_garden_owner(garden_id)))
with check ((select private.is_garden_owner(garden_id)));

alter policy "garden_members_delete_owner"
on public.garden_members
to authenticated
using ((select private.is_garden_owner(garden_id)));

alter policy "items_select_member_or_shared"
on public.items
to authenticated
using ((select private.can_read_garden(garden_id)));

alter policy "items_insert_uploaders"
on public.items
to authenticated
with check (
  (select private.can_upload_to_garden(garden_id))
  and (select private.is_valid_item_parent(id, garden_id, parent_id))
);

alter policy "items_update_uploaders"
on public.items
to authenticated
using ((select private.can_upload_to_garden(garden_id)))
with check (
  (select private.can_upload_to_garden(garden_id))
  and (select private.is_valid_item_parent(id, garden_id, parent_id))
);

alter policy "items_delete_deleters"
on public.items
to authenticated
using ((select private.can_delete_from_garden(garden_id)));

alter policy "shares_select_public_or_member"
on public.shares
to authenticated
using ((select private.can_manage_share(id)));

alter policy "shares_insert_members"
on public.shares
to authenticated
with check ((select private.can_write_share(item_id, user_id)));

alter policy "shares_update_creator_or_owner"
on public.shares
to authenticated
using ((select private.can_manage_share(id)))
with check ((select private.can_write_share(item_id, user_id)));

alter policy "shares_delete_creator_or_owner"
on public.shares
to authenticated
using ((select private.can_manage_share(id)));

alter policy "Owners can view public links"
on public.garden_public_links
to authenticated
using ((select private.is_garden_owner(garden_id)));

alter policy "Users can view their public access"
on public.garden_public_visitors
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.garden_public_links link
    where link.id = public_link_id
      and (select private.is_garden_owner(link.garden_id))
  )
);

revoke all on public.gardens from anon, authenticated;
revoke all on public.garden_members from anon, authenticated;
revoke all on public.items from anon, authenticated;
revoke all on public.shares from anon, authenticated;
revoke all on public.garden_public_links from anon, authenticated;
revoke all on public.garden_public_visitors from anon, authenticated;

revoke create, usage on schema public from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;

grant select on public.items to authenticated;

grant select, insert, update, delete
  on public.gardens,
     public.garden_members,
     public.items,
     public.shares,
     public.garden_public_links,
     public.garden_public_visitors
  to service_role;

revoke execute on all functions in schema public
  from public, anon, authenticated;

grant execute on function public.internal_move_file_record(
  uuid,
  uuid,
  uuid,
  text,
  text
) to service_role;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke usage, select on sequences
  from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions
  from public, anon, authenticated, service_role;

drop function if exists public.can_manage_share(uuid);
drop function if exists public.can_write_share(uuid, uuid);
drop function if exists public.item_is_in_readable_garden(uuid);
drop function if exists public.item_has_active_share_access(uuid);
drop function if exists public.is_valid_item_parent(uuid, uuid, uuid);
drop function if exists public.can_delete_from_garden(uuid);
drop function if exists public.can_upload_to_garden(uuid);
drop function if exists public.can_read_garden(uuid);
drop function if exists public.has_public_garden_access(uuid, text);
drop function if exists public.is_garden_owner(uuid);
drop function if exists public.is_garden_member(uuid);

commit;
