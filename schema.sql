-- ==============================================================================
-- Multi-tenant "Gardens" Schema with Supabase RLS
-- ==============================================================================

-- Enable pg_trgm for search
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- ==============================================================================
-- 1. Gardens: top-level tenant container
-- ==============================================================================

CREATE TABLE public.gardens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),

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
  mime_type text NULL,
  status text NOT NULL DEFAULT 'pending',
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
  CONSTRAINT items_status_check CHECK (status IN ('pending', 'ready'))
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
-- 5. Indexes
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
  ON public.items USING gin (name gin_trgm_ops);

CREATE INDEX idx_items_pending
  ON public.items (garden_id, status)
  WHERE status = 'pending';

CREATE INDEX idx_shares_item_id
  ON public.shares (item_id);

-- ==============================================================================
-- 6. Utility triggers
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
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

-- Automatically make the garden creator an owner/member.
CREATE OR REPLACE FUNCTION public.add_garden_creator_as_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
AS $$
BEGIN
  IF NEW.garden_id IS DISTINCT FROM OLD.garden_id THEN
    RAISE EXCEPTION 'items cannot be moved across gardens';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER items_prevent_garden_change
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_item_garden_change();

-- ==============================================================================
-- 7. RLS helper functions
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_garden_member(p_garden_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.garden_members gm
      WHERE gm.garden_id = p_garden_id
        AND gm.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.is_garden_owner(p_garden_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.garden_members gm
        WHERE gm.garden_id = p_garden_id
          AND gm.user_id = auth.uid()
          AND gm.role = 'owner'
      )
      OR EXISTS (
        SELECT 1
        FROM public.gardens g
        WHERE g.id = p_garden_id
          AND g.created_by = auth.uid()
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_garden(p_garden_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_garden_member(p_garden_id)
    OR public.is_garden_owner(p_garden_id);
$$;

CREATE OR REPLACE FUNCTION public.can_upload_to_garden(p_garden_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.is_garden_owner(p_garden_id)
      OR EXISTS (
        SELECT 1
        FROM public.garden_members gm
        WHERE gm.garden_id = p_garden_id
          AND gm.user_id = auth.uid()
          AND gm.can_upload = true
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_delete_from_garden(p_garden_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      public.is_garden_owner(p_garden_id)
      OR EXISTS (
        SELECT 1
        FROM public.garden_members gm
        WHERE gm.garden_id = p_garden_id
          AND gm.user_id = auth.uid()
          AND gm.can_delete = true
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_valid_item_parent(
  p_item_id uuid,
  p_garden_id uuid,
  p_parent_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
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
      )
      AND NOT EXISTS (
        SELECT 1
        FROM ancestors
        WHERE ancestors.id = p_item_id
      )
    );
$$;

-- A public share on a folder exposes that folder and its descendants.
CREATE OR REPLACE FUNCTION public.item_has_active_share_access(p_item_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH RECURSIVE ancestors(id, parent_id, path) AS (
    SELECT i.id, i.parent_id, ARRAY[i.id]
    FROM public.items i
    WHERE i.id = p_item_id

    UNION ALL

    SELECT parent.id, parent.parent_id, ancestors.path || parent.id
    FROM public.items parent
    JOIN ancestors ON ancestors.parent_id = parent.id
    WHERE NOT parent.id = ANY(ancestors.path)
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.shares s
    JOIN ancestors a ON a.id = s.item_id
    WHERE s.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.item_is_in_readable_garden(p_item_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.items i
    WHERE i.id = p_item_id
      AND public.can_read_garden(i.garden_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_share(
  p_item_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.items i
      WHERE i.id = p_item_id
        AND public.can_read_garden(i.garden_id)
        AND (
          p_user_id = auth.uid()
          OR public.is_garden_owner(i.garden_id)
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_share(p_share_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.shares s
      JOIN public.items i ON i.id = s.item_id
      WHERE s.id = p_share_id
        AND (
          public.is_garden_owner(i.garden_id)
          OR (
            s.user_id = auth.uid()
            AND public.can_read_garden(i.garden_id)
          )
        )
    );
$$;

-- ==============================================================================
-- 8. Enable RLS
-- ==============================================================================

ALTER TABLE public.gardens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garden_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 9. Gardens policies
-- ==============================================================================

CREATE POLICY "gardens_select_readable"
ON public.gardens
FOR SELECT
TO authenticated
USING (
  public.can_read_garden(id)
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
  public.is_garden_owner(id)
)
WITH CHECK (
  public.is_garden_owner(id)
);

CREATE POLICY "gardens_delete_owner"
ON public.gardens
FOR DELETE
TO authenticated
USING (
  public.is_garden_owner(id)
);

-- ==============================================================================
-- 10. Garden members policies
-- ==============================================================================

CREATE POLICY "garden_members_select_self_or_owner"
ON public.garden_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_garden_owner(garden_id)
);

CREATE POLICY "garden_members_insert_owner"
ON public.garden_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_garden_owner(garden_id)
);

CREATE POLICY "garden_members_update_owner"
ON public.garden_members
FOR UPDATE
TO authenticated
USING (
  public.is_garden_owner(garden_id)
)
WITH CHECK (
  public.is_garden_owner(garden_id)
);

CREATE POLICY "garden_members_delete_owner"
ON public.garden_members
FOR DELETE
TO authenticated
USING (
  public.is_garden_owner(garden_id)
);

-- ==============================================================================
-- 11. Items policies
-- ==============================================================================

CREATE POLICY "items_select_member_or_shared"
ON public.items
FOR SELECT
TO anon, authenticated
USING (
  public.can_read_garden(garden_id)
  OR public.item_has_active_share_access(id)
);

CREATE POLICY "items_insert_uploaders"
ON public.items
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_upload_to_garden(garden_id)
  AND public.is_valid_item_parent(id, garden_id, parent_id)
);

CREATE POLICY "items_update_uploaders"
ON public.items
FOR UPDATE
TO authenticated
USING (
  public.can_upload_to_garden(garden_id)
)
WITH CHECK (
  public.can_upload_to_garden(garden_id)
  AND public.is_valid_item_parent(id, garden_id, parent_id)
);

CREATE POLICY "items_delete_deleters"
ON public.items
FOR DELETE
TO authenticated
USING (
  public.can_delete_from_garden(garden_id)
);

-- ==============================================================================
-- 12. Shares policies
-- ==============================================================================

CREATE POLICY "shares_select_public_or_member"
ON public.shares
FOR SELECT
TO anon, authenticated
USING (
  expires_at > now()
  OR public.item_is_in_readable_garden(item_id)
);

CREATE POLICY "shares_insert_members"
ON public.shares
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.item_is_in_readable_garden(item_id)
);

CREATE POLICY "shares_update_creator_or_owner"
ON public.shares
FOR UPDATE
TO authenticated
USING (
  public.can_manage_share(id)
)
WITH CHECK (
  public.can_write_share(item_id, user_id)
);

CREATE POLICY "shares_delete_creator_or_owner"
ON public.shares
FOR DELETE
TO authenticated
USING (
  public.can_manage_share(id)
);

-- ==============================================================================
-- 13. Grants for Supabase API roles
-- ==============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.items TO anon;
GRANT SELECT ON public.shares TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gardens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.garden_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shares TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_garden_member(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_garden_owner(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_garden(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_upload_to_garden(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_from_garden(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_item_parent(uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.item_has_active_share_access(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.item_is_in_readable_garden(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_share(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_share(uuid) TO anon, authenticated;