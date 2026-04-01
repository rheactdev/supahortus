-- ==============================================================================
-- RLS POLICIES: Multi-tenant Gardens
-- ==============================================================================

-- 1. Enable RLS on all tables
ALTER TABLE public.gardens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garden_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2. Helper: check if user is a member of a garden (with optional permission)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_garden_member(
  _garden_id uuid,
  _permission text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM garden_members
    WHERE garden_id = _garden_id
      AND user_id = auth.uid()
      AND (
        _permission IS NULL
        OR (_permission = 'upload' AND can_upload = true)
        OR (_permission = 'delete' AND can_delete = true)
        OR (_permission = 'owner' AND role = 'owner')
      )
  );
$$;

-- ==============================================================================
-- 3. POLICIES FOR: public.gardens
-- ==============================================================================

CREATE POLICY "Members can view gardens"
  ON public.gardens FOR SELECT
  USING (is_garden_member(id));

CREATE POLICY "Owners can update gardens"
  ON public.gardens FOR UPDATE
  USING (is_garden_member(id, 'owner'));

CREATE POLICY "Owners can delete gardens"
  ON public.gardens FOR DELETE
  USING (is_garden_member(id, 'owner'));

CREATE POLICY "Authenticated users can create gardens"
  ON public.gardens FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- ==============================================================================
-- 4. POLICIES FOR: public.garden_members
-- ==============================================================================

CREATE POLICY "Members can view garden members"
  ON public.garden_members FOR SELECT
  USING (is_garden_member(garden_id));

CREATE POLICY "Owners can add garden members"
  ON public.garden_members FOR INSERT
  WITH CHECK (is_garden_member(garden_id, 'owner'));

CREATE POLICY "Owners can update garden members"
  ON public.garden_members FOR UPDATE
  USING (is_garden_member(garden_id, 'owner'));

CREATE POLICY "Owners can remove garden members"
  ON public.garden_members FOR DELETE
  USING (is_garden_member(garden_id, 'owner'));

-- ==============================================================================
-- 5. POLICIES FOR: public.items
-- ==============================================================================

CREATE POLICY "Members can view items"
  ON public.items FOR SELECT
  USING (is_garden_member(garden_id));

CREATE POLICY "Uploaders can create items"
  ON public.items FOR INSERT
  WITH CHECK (is_garden_member(garden_id, 'upload'));

CREATE POLICY "Uploaders can update items"
  ON public.items FOR UPDATE
  USING (is_garden_member(garden_id, 'upload'));

CREATE POLICY "Deleters can delete items"
  ON public.items FOR DELETE
  USING (is_garden_member(garden_id, 'delete'));

-- ==============================================================================
-- 6. POLICIES FOR: public.shares
-- ==============================================================================

CREATE POLICY "Anyone can view valid share links"
  ON public.shares FOR SELECT
  USING (expires_at > now());

CREATE POLICY "Uploaders can create share links"
  ON public.shares FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = shares.item_id
        AND is_garden_member(items.garden_id, 'upload')
    )
  );

CREATE POLICY "Deleters can revoke share links"
  ON public.shares FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.items
      WHERE items.id = shares.item_id
        AND is_garden_member(items.garden_id, 'delete')
    )
  );