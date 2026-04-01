-- 1. Create the core items table first
CREATE TABLE public.items (
  id uuid NOT NULL DEFAULT gen_random_uuid (),
  parent_id uuid NULL,
  name text NOT NULL,
  size bigint NULL,
  mime_type text NULL,
  s3_key text NOT NULL,
  owner_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  
  CONSTRAINT items_pkey PRIMARY KEY (id),
  CONSTRAINT items_s3_key_unique UNIQUE (s3_key),
  CONSTRAINT items_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users (id) ON DELETE CASCADE,
  CONSTRAINT items_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES items (id) ON DELETE CASCADE,
  CONSTRAINT valid_item_state CHECK (
    (
      (size IS NULL) AND (mime_type IS NULL)
    ) OR (
      (size IS NOT NULL) AND (mime_type IS NOT NULL)
    )
  )
) TABLESPACE pg_default;

-- 2. Create the dependent share tables
CREATE TABLE public.folder_shares (
  id uuid NOT NULL DEFAULT gen_random_uuid (),
  item_id uuid NOT NULL,
  user_email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone ('utc'::text, now()),
  
  CONSTRAINT folder_shares_pkey PRIMARY KEY (id),
  CONSTRAINT folder_shares_item_id_user_email_key UNIQUE (item_id, user_email),
  CONSTRAINT folder_shares_item_id_fkey FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE TABLE public.shares (
  id uuid NOT NULL DEFAULT gen_random_uuid (),
  short_code text NOT NULL,
  item_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone ('utc'::text, now()),
  expires_at timestamp with time zone NOT NULL DEFAULT (
    timezone ('utc'::text, now()) + '7 days'::interval
  ),
  user_id uuid NULL,
  
  CONSTRAINT shares_pkey PRIMARY KEY (id),
  CONSTRAINT shares_short_code_key UNIQUE (short_code),
  CONSTRAINT shares_item_id_fkey FOREIGN KEY (item_id) REFERENCES items (id) ON DELETE CASCADE,
  CONSTRAINT shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- 3. Create all indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_name_in_folder ON public.items USING btree (parent_id, name) TABLESPACE pg_default WHERE (parent_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_name_in_root ON public.items USING btree (owner_id, name) TABLESPACE pg_default WHERE (parent_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_items_parent_id ON public.items USING btree (parent_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_items_owner_id ON public.items USING btree (owner_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_folder_shares_item_id ON public.folder_shares USING btree (item_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_shares_item_id ON public.shares USING btree (item_id) TABLESPACE pg_default;