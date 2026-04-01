-- ==============================================================================
-- Multi-tenant "Gardens" Schema
-- ==============================================================================

-- Enable pg_trgm for search
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- 1. Gardens: top-level tenant container
CREATE TABLE public.gardens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT gardens_pkey PRIMARY KEY (id),
  CONSTRAINT gardens_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 2. Garden members: maps users to gardens with permissions
CREATE TABLE public.garden_members (
  garden_id uuid NOT NULL,
  user_id uuid NOT NULL,
  can_upload boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  role text NOT NULL DEFAULT 'member',

  CONSTRAINT garden_members_pkey PRIMARY KEY (garden_id, user_id),
  CONSTRAINT garden_members_garden_id_fkey FOREIGN KEY (garden_id) REFERENCES public.gardens(id) ON DELETE CASCADE,
  CONSTRAINT garden_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT garden_members_role_check CHECK (role IN ('owner', 'member'))
);

-- 3. Items: the logical file tree, scoped to gardens
CREATE TABLE public.items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  garden_id uuid NOT NULL,
  parent_id uuid NULL,
  name text NOT NULL,
  type text NOT NULL,
  s3_key text NOT NULL,
  mime_type text NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT items_pkey PRIMARY KEY (id),
  CONSTRAINT items_garden_id_fkey FOREIGN KEY (garden_id) REFERENCES public.gardens(id) ON DELETE CASCADE,
  CONSTRAINT items_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.items(id) ON DELETE CASCADE,
  CONSTRAINT items_s3_key_unique UNIQUE (s3_key),
  CONSTRAINT items_type_check CHECK (type IN ('file', 'folder')),
  CONSTRAINT items_status_check CHECK (status IN ('pending', 'ready'))
);

-- 4. Shares: public short-code links
CREATE TABLE public.shares (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  short_code text NOT NULL,
  item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  expires_at timestamptz NOT NULL DEFAULT (timezone('utc', now()) + interval '7 days'),
  user_id uuid NULL,

  CONSTRAINT shares_pkey PRIMARY KEY (id),
  CONSTRAINT shares_short_code_key UNIQUE (short_code),
  CONSTRAINT shares_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE,
  CONSTRAINT shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 5. Indexes
CREATE UNIQUE INDEX idx_unique_name_in_folder ON public.items (garden_id, parent_id, name) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX idx_unique_name_in_root ON public.items (garden_id, name) WHERE parent_id IS NULL;
CREATE INDEX idx_items_garden_parent ON public.items (garden_id, parent_id);
CREATE INDEX idx_garden_members_user_id ON public.garden_members (user_id);
CREATE INDEX idx_items_name_trgm ON public.items USING gin (name gin_trgm_ops);
CREATE INDEX idx_items_pending ON public.items (garden_id, status) WHERE status = 'pending';
CREATE INDEX idx_shares_item_id ON public.shares (item_id);

-- 6. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();