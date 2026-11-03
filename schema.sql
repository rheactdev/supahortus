-- ==============================================================================
-- Multi-tenant "Gardens" Schema with Supabase RLS
-- ==============================================================================

-- Keep extensions outside the exposed API schema.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

-- ==============================================================================
-- 1. Gardens: top-level tenant container
-- ==============================================================================

CREATE TABLE public.gardens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  storage_prefix text NOT NULL,

  CONSTRAINT gardens_storage_prefix_key UNIQUE (storage_prefix),
  CONSTRAINT gardens_storage_prefix_format CHECK (
    storage_prefix = 'hortus/' || slug || '/'
    OR storage_prefix = 'hortus-v2/' || slug || '/' || id::text || '/'
  ),
  CONSTRAINT gardens_pkey PRIMARY KEY (id),
  CONSTRAINT gardens_slug_key UNIQUE (slug),
  CONSTRAINT gardens_slug_format CHECK (
    slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
    OR slug ~ '^[a-z0-9]$'
  ),
  CONSTRAINT gardens_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
);

-- ==============================================================================
-- 2. Garden members: maps users to gardens with permissions
-- ==============================================================================

CREATE TABLE public.garden_members (
  garden_id uuid NOT NULL,
  user_id uuid NOT NULL,
  can_upload boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  role text NOT NULL DEFAULT 'member',

  CONSTRAINT garden_members_pkey PRIMARY KEY (garden_id, user_id),
  CONSTRAINT garden_members_garden_id_fkey FOREIGN KEY (garden_id)
    REFERENCES public.gardens(id)
    ON DELETE CASCADE,
  CONSTRAINT garden_members_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE,
  CONSTRAINT garden_members_role_check CHECK (role IN ('owner', 'member'))
);

-- ==============================================================================
-- 3. Items: the logical file tree, scoped to gardens
-- ==============================================================================

CREATE TABLE public.items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  garden_id uuid NOT NULL,
  parent_id uuid NULL,
  name text NOT NULL,
  type text NOT NULL,
  s3_key text NOT NULL,
  thumbnail_key text NULL,
  preview_key text NULL,
  preview_status text NULL,
  preview_error text NULL,
  mime_type text NULL,
  status text NOT NULL DEFAULT 'pending',
  fts tsvector GENERATED ALWAYS AS (to_tsvector('english', name)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT items_pkey PRIMARY KEY (id),
  CONSTRAINT items_garden_id_fkey FOREIGN KEY (garden_id)
    REFERENCES public.gardens(id)
    ON DELETE CASCADE,
  CONSTRAINT items_parent_id_fkey FOREIGN KEY (parent_id)
    REFERENCES public.items(id)
    ON DELETE CASCADE,
  CONSTRAINT items_s3_key_unique UNIQUE (s3_key),
  CONSTRAINT items_type_check CHECK (type IN ('file', 'folder')),
  CONSTRAINT items_status_check CHECK (status IN ('pending', 'ready')),
  CONSTRAINT items_preview_status_check CHECK (
    preview_status IS NULL
    OR preview_status IN ('pending', 'ready', 'failed')
  )
);

-- ==============================================================================
-- 4. Shares: public short-code links
-- ==============================================================================

CREATE TABLE public.shares (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  short_code text NOT NULL,
  item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  user_id uuid NULL DEFAULT auth.uid(),

  CONSTRAINT shares_pkey PRIMARY KEY (id),
  CONSTRAINT shares_short_code_key UNIQUE (short_code),
  CONSTRAINT shares_item_id_fkey FOREIGN KEY (item_id)
    REFERENCES public.items(id)
    ON DELETE CASCADE,
  CONSTRAINT shares_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
);

-- ==============================================================================
-- 5. Public garden links and anonymous visitor bindings
-- ==============================================================================

CREATE TABLE public.garden_public_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  garden_id uuid NOT NULL,
  token text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  can_upload boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT garden_public_links_pkey PRIMARY KEY (id),
  CONSTRAINT garden_public_links_garden_id_key UNIQUE (garden_id),
  CONSTRAINT garden_public_links_token_key UNIQUE (token),
  CONSTRAINT garden_public_links_token_length CHECK (char_length(token) >= 32),
  CONSTRAINT garden_public_links_garden_id_fkey FOREIGN KEY (garden_id)
    REFERENCES public.gardens(id)
    ON DELETE CASCADE,
  CONSTRAINT garden_public_links_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
);

CREATE TABLE public.garden_public_visitors (
  public_link_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT garden_public_visitors_pkey PRIMARY KEY (public_link_id, user_id),
  CONSTRAINT garden_public_visitors_public_link_id_fkey
    FOREIGN KEY (public_link_id)
    REFERENCES public.garden_public_links(id)
    ON DELETE CASCADE,
  CONSTRAINT garden_public_visitors_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id)
    ON DELETE CASCADE
);

-- ==============================================================================
-- 6. Indexes
-- ==============================================================================

CREATE UNIQUE INDEX idx_unique_name_in_folder
  ON public.items (garden_id, parent_id, name)
  WHERE parent_id IS NOT NULL;

CREATE UNIQUE INDEX idx_unique_name_in_root
  ON public.items (garden_id, name)
  WHERE parent_id IS NULL;

CREATE INDEX idx_items_garden_parent
  ON public.items (garden_id, parent_id);

CREATE INDEX idx_garden_members_user_id
  ON public.garden_members (user_id);

CREATE INDEX idx_items_name_trgm
  ON public.items USING gin (name extensions.gin_trgm_ops);

CREATE INDEX idx_items_fts
  ON public.items USING GIN (fts);

CREATE INDEX idx_items_pending
  ON public.items (garden_id, status)
  WHERE status = 'pending';

CREATE INDEX idx_items_office_preview_pending
  ON public.items (preview_status, updated_at)
  WHERE preview_status = 'pending';

CREATE INDEX idx_shares_item_id
  ON public.shares (item_id);

CREATE INDEX garden_public_links_created_by_idx
  ON public.garden_public_links (created_by);

CREATE INDEX garden_public_visitors_user_id_idx
  ON public.garden_public_visitors (user_id, public_link_id);

-- ==============================================================================
-- 7. Utility triggers
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER garden_public_links_updated_at
  BEFORE UPDATE ON public.garden_public_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Automatically make the garden creator an owner/member.
CREATE OR REPLACE FUNCTION public.add_garden_creator_as_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.garden_members (
    garden_id,
    user_id,
    can_upload,
    can_delete,
    role
  )
  VALUES (
    NEW.id,
    NEW.created_by,
    true,
    true,
    'owner'
  )
  ON CONFLICT (garden_id, user_id)
  DO UPDATE SET
    can_upload = true,
    can_delete = true,
    role = 'owner';

  RETURN NEW;
END;
$$;

CREATE TRIGGER gardens_add_creator_as_owner
  AFTER INSERT ON public.gardens
  FOR EACH ROW
  EXECUTE FUNCTION public.add_garden_creator_as_owner();

-- Prevent changing garden ownership identity after creation.
CREATE OR REPLACE FUNCTION public.prevent_garden_created_by_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'created_by cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER gardens_prevent_created_by_change
  BEFORE UPDATE ON public.gardens
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_garden_created_by_change();

-- Prevent moving items across gardens.
CREATE OR REPLACE FUNCTION public.prevent_item_garden_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.garden_id IS DISTINCT FROM OLD.garden_id
    AND (
      OLD.type <> 'file'
      OR COALESCE(
        current_setting('app.allow_cross_garden_file_move', true),
        ''
      ) <> 'on'
    )
  THEN
    RAISE EXCEPTION 'items cannot be moved across gardens';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_move_file_record(
  p_item_id uuid,
  p_target_garden_id uuid,
  p_target_parent_id uuid,
  p_new_s3_key text,
  p_new_thumbnail_key text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('app.allow_cross_garden_file_move', 'on', true);

  UPDATE public.items
  SET
    garden_id = p_target_garden_id,
    parent_id = p_target_parent_id,
    s3_key = p_new_s3_key,
    thumbnail_key = p_new_thumbnail_key
  WHERE id = p_item_id
    AND type = 'file';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'file not found';
  END IF;
END;
$$;

CREATE TRIGGER items_prevent_garden_change
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_item_garden_change();

-- ==============================================================================
-- 8. Private RLS helper functions
-- ==============================================================================

CREATE OR REPLACE FUNCTION private.is_garden_member(p_garden_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.garden_members member
      WHERE member.garden_id = p_garden_id
        AND member.user_id = (SELECT auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION private.is_garden_owner(p_garden_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.garden_members member
        WHERE member.garden_id = p_garden_id
          AND member.user_id = (SELECT auth.uid())
          AND member.role = 'owner'
      )
      OR EXISTS (
        SELECT 1
        FROM public.gardens garden
        WHERE garden.id = p_garden_id
          AND garden.created_by = (SELECT auth.uid())
      )
    );
$$;

CREATE OR REPLACE FUNCTION private.has_public_garden_access(
  p_garden_id uuid,
  p_permission text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND p_permission IN ('read', 'upload', 'delete')
    AND EXISTS (
      SELECT 1
      FROM public.garden_public_links link
      JOIN public.garden_public_visitors visitor
        ON visitor.public_link_id = link.id
      WHERE link.garden_id = p_garden_id
        AND link.enabled = true
        AND visitor.user_id = (SELECT auth.uid())
        AND (
          p_permission = 'read'
          OR (p_permission = 'upload' AND link.can_upload)
          OR (p_permission = 'delete' AND link.can_delete)
        )
    );
$$;

CREATE OR REPLACE FUNCTION private.can_read_garden(p_garden_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT private.is_garden_member(p_garden_id)
    OR private.is_garden_owner(p_garden_id)
    OR private.has_public_garden_access(p_garden_id, 'read');
$$;

CREATE OR REPLACE FUNCTION private.can_upload_to_garden(p_garden_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (
      private.is_garden_owner(p_garden_id)
      OR EXISTS (
        SELECT 1
        FROM public.garden_members member
        WHERE member.garden_id = p_garden_id
          AND member.user_id = (SELECT auth.uid())
          AND member.can_upload
      )
      OR private.has_public_garden_access(p_garden_id, 'upload')
    );
$$;

CREATE OR REPLACE FUNCTION private.can_delete_from_garden(p_garden_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND (
      private.is_garden_owner(p_garden_id)
      OR EXISTS (
        SELECT 1
        FROM public.garden_members member
        WHERE member.garden_id = p_garden_id
          AND member.user_id = (SELECT auth.uid())
          AND member.can_delete
      )
      OR private.has_public_garden_access(p_garden_id, 'delete')
    );
$$;

CREATE OR REPLACE FUNCTION private.is_valid_item_parent(
  p_item_id uuid,
  p_garden_id uuid,
  p_parent_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  WITH RECURSIVE ancestors(id, parent_id, path) AS (
    SELECT i.id, i.parent_id, ARRAY[i.id]
    FROM public.items i
    WHERE i.id = p_parent_id

    UNION ALL

    SELECT parent.id, parent.parent_id, ancestors.path || parent.id
    FROM public.items parent
    JOIN ancestors ON ancestors.parent_id = parent.id
    WHERE NOT parent.id = ANY(ancestors.path)
  )
  SELECT
    p_parent_id IS NULL
    OR (
      EXISTS (
        SELECT 1
        FROM public.items parent
        WHERE parent.id = p_parent_id
          AND parent.garden_id = p_garden_id
          AND parent.type = 'folder'
          AND parent.status = 'ready'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM ancestors
        WHERE ancestors.id = p_item_id
      )
    );
$$;

CREATE OR REPLACE FUNCTION private.can_write_share(
  p_item_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.items item
      WHERE item.id = p_item_id
        AND item.status = 'ready'
        AND private.can_upload_to_garden(item.garden_id)
        AND (
          p_user_id = (SELECT auth.uid())
          OR private.is_garden_owner(item.garden_id)
        )
    );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_share(p_share_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.shares share
      JOIN public.items item ON item.id = share.item_id
      WHERE share.id = p_share_id
        AND item.status = 'ready'
        AND (
          private.is_garden_owner(item.garden_id)
          OR (
            share.user_id = (SELECT auth.uid())
            AND private.can_upload_to_garden(item.garden_id)
          )
        )
    );
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private
  TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private
  REVOKE EXECUTE ON FUNCTIONS
  FROM PUBLIC, anon, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private
  GRANT EXECUTE ON FUNCTIONS
  TO authenticated;

-- ==============================================================================
-- 9. Enable RLS
-- ==============================================================================

ALTER TABLE public.gardens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garden_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garden_public_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garden_public_visitors ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 10. Gardens policies
-- ==============================================================================

CREATE POLICY "gardens_select_readable"
ON public.gardens
FOR SELECT
TO authenticated
USING (
  (SELECT private.can_read_garden(id))
);

CREATE POLICY "gardens_insert_own"
ON public.gardens
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
);

CREATE POLICY "gardens_update_owner"
ON public.gardens
FOR UPDATE
TO authenticated
USING (
  (SELECT private.is_garden_owner(id))
)
WITH CHECK (
  (SELECT private.is_garden_owner(id))
);

CREATE POLICY "gardens_delete_owner"
ON public.gardens
FOR DELETE
TO authenticated
USING (
  (SELECT private.is_garden_owner(id))
);

-- ==============================================================================
-- 11. Garden members policies
-- ==============================================================================

CREATE POLICY "garden_members_select_self_or_owner"
ON public.garden_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (SELECT private.is_garden_owner(garden_id))
);

CREATE POLICY "garden_members_insert_owner"
ON public.garden_members
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT private.is_garden_owner(garden_id))
);

CREATE POLICY "garden_members_update_owner"
ON public.garden_members
FOR UPDATE
TO authenticated
USING (
  (SELECT private.is_garden_owner(garden_id))
)
WITH CHECK (
  (SELECT private.is_garden_owner(garden_id))
);

CREATE POLICY "garden_members_delete_owner"
ON public.garden_members
FOR DELETE
TO authenticated
USING (
  (SELECT private.is_garden_owner(garden_id))
);

-- ==============================================================================
-- 12. Items policies
-- ==============================================================================

CREATE POLICY "items_select_member_or_shared"
ON public.items
FOR SELECT
TO authenticated
USING (
  (SELECT private.can_read_garden(garden_id))
);

CREATE POLICY "items_insert_uploaders"
ON public.items
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT private.can_upload_to_garden(garden_id))
  AND (SELECT private.is_valid_item_parent(id, garden_id, parent_id))
);

CREATE POLICY "items_update_uploaders"
ON public.items
FOR UPDATE
TO authenticated
USING (
  (SELECT private.can_upload_to_garden(garden_id))
)
WITH CHECK (
  (SELECT private.can_upload_to_garden(garden_id))
  AND (SELECT private.is_valid_item_parent(id, garden_id, parent_id))
);

CREATE POLICY "items_delete_deleters"
ON public.items
FOR DELETE
TO authenticated
USING (
  (SELECT private.can_delete_from_garden(garden_id))
);

-- ==============================================================================
-- 13. Shares policies
-- ==============================================================================

CREATE POLICY "shares_select_public_or_member"
ON public.shares
FOR SELECT
TO authenticated
USING (
  (SELECT private.can_manage_share(id))
);

CREATE POLICY "shares_insert_members"
ON public.shares
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT private.can_write_share(item_id, user_id))
);

CREATE POLICY "shares_update_creator_or_owner"
ON public.shares
FOR UPDATE
TO authenticated
USING (
  (SELECT private.can_manage_share(id))
)
WITH CHECK (
  (SELECT private.can_write_share(item_id, user_id))
);

CREATE POLICY "shares_delete_creator_or_owner"
ON public.shares
FOR DELETE
TO authenticated
USING (
  (SELECT private.can_manage_share(id))
);

-- ==============================================================================
-- 14. Public garden policies
-- ==============================================================================

CREATE POLICY "Owners can view public links"
ON public.garden_public_links
FOR SELECT
TO authenticated
USING (
  (SELECT private.is_garden_owner(garden_id))
);

CREATE POLICY "Users can view their public access"
ON public.garden_public_visitors
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.garden_public_links link
    WHERE link.id = public_link_id
      AND (SELECT private.is_garden_owner(link.garden_id))
  )
);

-- ==============================================================================
-- 15. Grants for Supabase API roles
-- ==============================================================================

REVOKE CREATE, USAGE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT ON public.items TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.gardens,
     public.garden_members,
     public.items,
     public.shares,
     public.garden_public_links,
     public.garden_public_visitors
  TO service_role;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.internal_move_file_record(
  uuid,
  uuid,
  uuid,
  text,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.internal_move_file_record(
  uuid,
  uuid,
  uuid,
  text,
  text
) TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES
  FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES
  FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS
  FROM PUBLIC, anon, authenticated, service_role;

-- ==============================================================================
-- 16. Garden storage lifecycle and public link transactions
-- ==============================================================================

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
revoke execute on function public.create_garden_with_slug_reservation(text, text, uuid) from public, anon, authenticated;
revoke execute on function public.begin_garden_deletion(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rotate_garden_public_link(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.redeem_garden_public_link(text, uuid) from public, anon, authenticated;
grant execute on function public.create_garden_with_slug_reservation(text, text, uuid) to service_role;
grant execute on function public.begin_garden_deletion(uuid, uuid) to service_role;
grant execute on function public.rotate_garden_public_link(uuid, uuid, text) to service_role;
grant execute on function public.redeem_garden_public_link(text, uuid) to service_role;
