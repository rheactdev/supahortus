-- 1. Gardens: top-level tenant container
CREATE TABLE IF NOT EXISTS gardens (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  FOREIGN KEY (created_by) REFERENCES user(id) ON DELETE CASCADE
);

-- 2. Garden members: maps users to gardens with permissions
CREATE TABLE IF NOT EXISTS garden_members (
  garden_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  can_upload INTEGER NOT NULL DEFAULT 0,
  can_delete INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'member',

  PRIMARY KEY (garden_id, user_id),
  FOREIGN KEY (garden_id) REFERENCES gardens(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- 3. Items: the logical file tree, scoped to gardens
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL,
  parent_id TEXT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  s3_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),

  FOREIGN KEY (garden_id) REFERENCES gardens(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES items(id) ON DELETE CASCADE
);

-- 4. Shares: public short-code links
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  short_code TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  user_id TEXT NULL,

  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

-- 5. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_name_in_folder ON items (garden_id, parent_id, name) WHERE parent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_name_in_root ON items (garden_id, name) WHERE parent_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_items_garden_parent ON items (garden_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_garden_members_user_id ON garden_members (user_id);
CREATE INDEX IF NOT EXISTS idx_items_pending ON items (garden_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_shares_item_id ON shares (item_id);

-- Better Auth tables will be created by the Better Auth CLI/adapter.
