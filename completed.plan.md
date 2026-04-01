# Plan: DB-First Migration — COMPLETED

## TL;DR
Migrate from S3-prefix-based file listing to DB-first using the existing `items` adjacency list table with `s3_key`. **Let Supabase RLS do all access control** — delete `lib/auth.ts` entirely. Every API route shrinks to: authenticate → query/mutate Supabase → (optionally) sign an S3 URL. QStash handles the only hard problem (folder rename reconciliation).

## Core Principle: Be Lazy
- **RLS replaces application-level access checks.** The `has_shared_access()` recursive CTE + owner policy already enforces everything. No more `checkAccess()` calls.
- **DB replaces S3 ListObjectsV2.** Listing a folder = `SELECT * FROM items WHERE parent_id = ?`. Zero S3 API calls for navigation.
- **S3 is only touched for bytes** — presign upload, presign download, copy/delete during rename. Nothing else.
- **No new dependencies.** QStash is the only addition (free tier: 500 msg/day).

---

## Phase 1: API Route Rewrites (DB-First)

All routes switch from S3-prefix queries to Supabase `items` queries. RLS auto-filters results.

### Step 1: Delete `lib/auth.ts`
- The entire file (`checkAccess`, `getSharedPrefixes`) is replaced by RLS policies already in `rls.sql`.
- Every route that imports from `lib/auth` gets simplified.

### Step 2: Rewrite `/api/s3/list` → DB query
- **Before:** `ListObjectsV2Command` with prefix + delimiter, then application-level access check
- **After:** `supabase.from('items').select('*').eq('parent_id', folderId)` — or `.is('parent_id', null)` for root
- RLS auto-filters: owners see their items, shared users see shared subtrees
- **No S3 call at all.** Saves ListObjectsV2 cost + latency.
- Returns `{ items: [...] }` with id, name, size, mime_type, s3_key, created_at
- Client distinguishes folders (size === null) from files (size !== null)

### Step 3: Rewrite `/api/s3/presign` (upload)
- After generating presigned URL, INSERT into `items` table: `{ name, s3_key, parent_id, size, mime_type, owner_id }`
- RLS ensures only owner/admin can insert into their own tree
- Single extra DB write per upload (negligible cost)

### Step 4: Rewrite `/api/s3/delete`
- DELETE from `items` WHERE id = ? (CASCADE deletes child items for folders)
- Then delete from S3 (single file) or batch delete (folder contents via recursive query for s3_keys)
- RLS enforces ownership

### Step 5: Rewrite `/api/s3/folder` (create folder)
- INSERT into `items`: `{ name: folderName, parent_id, s3_key: parentKey + folderName + '/', owner_id }`
- Also PUT empty object to S3 (maintains human-readable bucket)
- RLS enforces parent folder access

### Step 6: Rewrite `/api/s3/download`
- Look up `s3_key` from `items` table by item ID (RLS enforces access)
- Sign the `s3_key` — done
- No application-level access check needed

### Step 7: Rewrite `/api/s3/share` (public short links)
- Already uses `shares` table with `item_id` in schema
- Current code uses `file_key` string — switch to `item_id` UUID
- Insert: `{ short_code, item_id, user_id }`

### Step 8: Rewrite `/api/s3/folder/share` (folder sharing)
- Current code uses `folder_prefix` string — switch to `item_id` UUID
- GET: `supabase.from('folder_shares').select('*').eq('item_id', itemId)` (RLS: owner sees all, recipient sees own)
- POST: `supabase.from('folder_shares').insert({ item_id, user_email })` + send invite
- DELETE: `supabase.from('folder_shares').delete().eq('item_id', itemId).eq('user_email', email)`

### Step 9: Rewrite `/app/s/[code]` (share link resolver)
- Query `shares` joined with `items` to get `s3_key`: `supabase.from('shares').select('item:items(s3_key), expires_at').eq('short_code', code).single()`
- Sign the s3_key, redirect

### Step 10: Simplify `/api/auth/me`
- Keep as-is (already minimal — returns email + isAdmin)

---

## Phase 2: Frontend Updates

### Step 11: Update DriveExplorer
- Navigation now uses `item.id` instead of S3 prefix strings
- URL: `/dashboard?folder=<uuid>` (or empty for root)
- Fetch: `GET /api/s3/list?parent=<uuid>`
- Folder links: `href="/dashboard?folder=${item.id}"`
- Breadcrumb: fetch ancestor chain from DB (recursive parent_id walk) or pass via state

### Step 12: Update FileCard
- Actions use `item.id` instead of `file.key`
- Download: `/api/s3/download?id=<uuid>`
- Delete: `/api/s3/delete?id=<uuid>`
- Share: `POST /api/s3/share { itemId: item.id }`

### Step 13: Update UppyUploader
- After presign, the API now returns `itemId` alongside the signed URL
- No frontend change needed for the upload itself (still direct-to-S3)
- The presign route handles DB insert server-side

### Step 14: Update CreateFolderDialog
- POST body: `{ name: folderName, parentId: currentFolderId }` instead of `{ prefix, folderName }`

### Step 15: Update folder share modal in DriveExplorer
- Use `item.id` instead of folder prefix string

---

## Phase 3: Folder Rename (QStash)

### Step 16: Add rename API route `/api/s3/rename`
- Accepts `{ itemId, newName }`
- Instant: `UPDATE items SET name = 'NewName' WHERE id = itemId` (RLS enforces ownership)
- If item is a folder: enqueue QStash job to reconcile s3_keys
- If item is a file: single S3 CopyObject + DeleteObject + update s3_key in DB

### Step 17: Add `/api/s3/rename-worker` (QStash webhook)
- Protected by QStash signature verification
- Fetches batch of items where `s3_key` doesn't match computed path from parent chain
- Copies 200 files per invocation, deletes old keys, updates s3_key in DB
- If more remain, re-enqueues itself
- Idempotent: safe to retry on failure

### Step 18: Add `s3_key` recompute helper
- SQL function or JS helper that walks `parent_id` chain to build expected `s3_key`
- Used by rename-worker to find stale keys

---

## Phase 4: Add rename UI

### Step 19: Add rename option to folder/file context menus
- DriveExplorer folder cards: add "Rename" to dropdown
- FileCard: add "Rename" to dropdown
- Inline rename input or small modal

---

## Relevant Files

- [schema.sql](schema.sql) — `items` table with `s3_key` (already updated)
- [rls.sql](rls.sql) — RLS policies + `has_shared_access()` (already complete, no changes)
- [lib/auth.ts](lib/auth.ts) — **DELETE entirely** (replaced by RLS)
- [lib/s3.ts](lib/s3.ts) — Keep as-is (S3 client config)
- [app/api/s3/list/route.ts](app/api/s3/list/route.ts) — Rewrite: DB query instead of ListObjectsV2
- [app/api/s3/presign/route.ts](app/api/s3/presign/route.ts) — Add DB insert after signing
- [app/api/s3/delete/route.ts](app/api/s3/delete/route.ts) — Delete from DB + S3
- [app/api/s3/download/route.ts](app/api/s3/download/route.ts) — Look up s3_key from DB by item ID
- [app/api/s3/folder/route.ts](app/api/s3/folder/route.ts) — Insert folder into DB + S3
- [app/api/s3/share/route.ts](app/api/s3/share/route.ts) — Switch from `file_key` to `item_id`
- [app/api/s3/folder/share/route.ts](app/api/s3/folder/share/route.ts) — Switch from `folder_prefix` to `item_id`
- [app/s/[code]/route.ts](app/s/[code]/route.ts) — Join shares→items for s3_key
- [components/ui/DriveExplorer.tsx](components/ui/DriveExplorer.tsx) — Navigate by item ID, not prefix
- [components/ui/FileCard.tsx](components/ui/FileCard.tsx) — Actions by item ID
- [components/ui/CreateFolderDialog.tsx](components/ui/CreateFolderDialog.tsx) — parentId instead of prefix
- [app/api/s3/rename/route.ts](app/api/s3/rename/route.ts) — **NEW**: instant rename + QStash enqueue
- [app/api/s3/rename-worker/route.ts](app/api/s3/rename-worker/route.ts) — **NEW**: QStash webhook for S3 key reconciliation

## Verification

1. **List folder:** Navigate to a folder in UI → should show items from DB, not S3
2. **Upload file:** Upload → file appears in DB (`items` row) AND in S3 bucket at correct key
3. **Delete file:** Delete → row gone from DB, object gone from S3
4. **Create folder:** New folder appears in DB and as empty S3 object
5. **Share link:** Create share → `/s/<code>` resolves via DB join to correct s3_key → download works
6. **Folder share:** Share folder with email → recipient sees folder contents (RLS grants access recursively)
7. **Rename folder:** Rename a folder with files → UI updates instantly, S3 keys reconcile in background
8. **Disaster recovery:** `rclone ls r2:bucket` shows human-readable paths matching DB s3_keys

## Decisions

- **RLS replaces all application-level access control** — `lib/auth.ts` deleted, no `checkAccess()` calls
- **No new dependencies except QStash** (free tier, 500 msg/day)
- **No S3 calls for navigation** — DB is source of truth for hierarchy
- **S3 only touched for presign (upload/download) and rename reconciliation**
- **folder_shares uses item_id** (not folder_prefix string) — already in schema
- **shares uses item_id** (not file_key string) — already in schema
- **Adjacency list (single items table)** — no separate folders table
