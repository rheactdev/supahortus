-- ==============================================================================
-- 1. ENABLE ROW LEVEL SECURITY
-- ==============================================================================
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folder_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2. THE RECURSIVE ACCESS FUNCTION
-- ==============================================================================
-- This function walks up the folder tree to see if the user's email 
-- exists on any parent folder's share record.
CREATE OR REPLACE FUNCTION public.has_shared_access(target_item_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  WITH RECURSIVE item_tree AS (
    -- Base case: start with the requested item
    SELECT id, parent_id FROM items WHERE id = target_item_id
    UNION ALL
    -- Recursive step: walk up the tree
    SELECT i.id, i.parent_id FROM items i
    JOIN item_tree it ON it.parent_id = i.id
  )
  -- Check if any item in the tree has a matching share for the current user's email
  SELECT EXISTS (
    SELECT 1 FROM folder_shares fs
    JOIN item_tree it ON fs.item_id = it.id
    WHERE fs.user_email = auth.jwt() ->> 'email'
  );
$$;

-- ==============================================================================
-- 3. POLICIES FOR: public.items
-- ==============================================================================
-- Owners have full CRUD access to their own files and folders
CREATE POLICY "Owners have full control over their items" 
ON public.items 
FOR ALL 
USING (owner_id = auth.uid());

-- Recipients have Read-Only access to shared items and their descendants
CREATE POLICY "Recipients can read shared folders and contents" 
ON public.items 
FOR SELECT 
USING (has_shared_access(id));

-- ==============================================================================
-- 4. POLICIES FOR: public.folder_shares
-- ==============================================================================
-- Owners of the underlying folder can create, update, and delete shares for it
CREATE POLICY "Owners can manage folder shares" 
ON public.folder_shares 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.items 
    WHERE items.id = folder_shares.item_id 
    AND items.owner_id = auth.uid()
  )
);

-- Recipients can see the shares explicitly granted to them (for their dashboard)
CREATE POLICY "Recipients can view their own folder shares" 
ON public.folder_shares 
FOR SELECT 
USING (user_email = auth.jwt() ->> 'email');

-- ==============================================================================
-- 5. POLICIES FOR: public.shares (Public Short Links)
-- ==============================================================================
-- Owners of the underlying item can create and revoke public links
CREATE POLICY "Owners can manage file links" 
ON public.shares 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.items 
    WHERE items.id = shares.item_id 
    AND items.owner_id = auth.uid()
  )
);

-- Anyone (including unauthenticated users) can resolve a valid, unexpired short link
CREATE POLICY "Anyone can view valid share links" 
ON public.shares 
FOR SELECT 
USING (expires_at > now());