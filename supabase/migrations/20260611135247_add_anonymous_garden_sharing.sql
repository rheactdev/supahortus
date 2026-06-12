create table public.garden_public_links (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null unique
    references public.gardens(id) on delete cascade,
  token text not null unique,
  enabled boolean not null default true,
  can_upload boolean not null default false,
  can_delete boolean not null default false,
  created_by uuid not null
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint garden_public_links_token_length
    check (char_length(token) >= 32)
);

create table public.garden_public_visitors (
  public_link_id uuid not null
    references public.garden_public_links(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (public_link_id, user_id)
);

create index garden_public_visitors_user_id_idx
  on public.garden_public_visitors (user_id, public_link_id);

create trigger garden_public_links_updated_at
  before update on public.garden_public_links
  for each row
  execute function public.update_updated_at();

alter table public.garden_public_links enable row level security;
alter table public.garden_public_visitors enable row level security;

create policy "Owners can view public links"
on public.garden_public_links
for select
to authenticated
using (public.is_garden_owner(garden_id));

create policy "Users can view their public access"
on public.garden_public_visitors
for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.garden_public_links link
    where link.id = public_link_id
      and public.is_garden_owner(link.garden_id)
  )
);

create or replace function public.has_public_garden_access(
  p_garden_id uuid,
  p_permission text default 'read'
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (select auth.uid()) is not null
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
          or (p_permission = 'upload' and link.can_upload = true)
          or (p_permission = 'delete' and link.can_delete = true)
        )
    );
$$;

create or replace function public.can_read_garden(p_garden_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_garden_member(p_garden_id)
    or public.is_garden_owner(p_garden_id)
    or public.has_public_garden_access(p_garden_id, 'read');
$$;

create or replace function public.can_upload_to_garden(p_garden_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (select auth.uid()) is not null
    and (
      public.is_garden_owner(p_garden_id)
      or exists (
        select 1
        from public.garden_members member
        where member.garden_id = p_garden_id
          and member.user_id = (select auth.uid())
          and member.can_upload = true
      )
      or public.has_public_garden_access(p_garden_id, 'upload')
    );
$$;

create or replace function public.can_delete_from_garden(p_garden_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (select auth.uid()) is not null
    and (
      public.is_garden_owner(p_garden_id)
      or exists (
        select 1
        from public.garden_members member
        where member.garden_id = p_garden_id
          and member.user_id = (select auth.uid())
          and member.can_delete = true
      )
      or public.has_public_garden_access(p_garden_id, 'delete')
    );
$$;

revoke all on public.garden_public_links from anon, authenticated;
revoke all on public.garden_public_visitors from anon, authenticated;
grant select on public.garden_public_links to authenticated;
grant select on public.garden_public_visitors to authenticated;

revoke execute on function public.has_public_garden_access(uuid, text)
  from public, anon;
grant execute on function public.has_public_garden_access(uuid, text)
  to authenticated;
