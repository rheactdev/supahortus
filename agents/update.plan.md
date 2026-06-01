Here is the complete, modular instruction plan for the **Supahortus** multi-tenant file manager rewrite.

Structured in strict, sequential phases.

***

### System Context & Architecture

**Project Goal:** 
Build a serverless, multi-tenant file manager (a "leaner Filestash") using Next.js App Router, Supabase (Postgres + Auth), Backblaze B2 (S3 API), and Upstash Workflow. 

**Core Architectural Rules:**
*   **No VPS or persistent backend.** The application must be entirely serverless.
*   **Direct-to-Storage:** All file uploads and downloads must bypass the Next.js API using S3 Presigned URLs. The backend only handles authorization and URL generation.
*   **Physical S3 Paths:** S3 object keys must reflect the actual human-readable folder structure (e.g., `{garden_id}/photos/vacation.jpg`). Do not use UUIDs for S3 object keys.
*   **Postgres as UI Source of Truth:** The `items` table in Postgres acts as a fast read-replica for the UI. We do not use `ListObjectsV2` to render the file explorer.
*   **Upstash Workflow for Heavy Mutations:** Folder moves, renames, and mass deletes must be handled durably by Upstash Workflow to avoid serverless timeouts.
*   **Multi-tenant "Gardens":** Files belong to a `garden_id`. Permissions are role-based via a `garden_members` join table.

---

### Phase 1: Database Schema & Row Level Security (RLS)

**Task 1: Generate the SQL migration for the multi-tenant architecture.**

Drop the old single-owner tables (`items`, `folder_shares`) and create the new multi-tenant schema.

| Table | Columns | Notes |
| :--- | :--- | :--- |
| `gardens` | `id` (UUID PK), `name` (Text), `created_by` (UUID FK → auth.users), `created_at` | Primary tenant container. |
| `garden_members` | `garden_id` (UUID FK → gardens), `user_id` (UUID FK → auth.users), `can_upload` (Bool default false), `can_delete` (Bool default false), `role` (Text: 'owner' / 'member') | Composite PK on `(garden_id, user_id)`. `can_view` is implicitly true for all members. |
| `items` | `id` (UUID PK), `garden_id` (UUID FK → gardens), `name` (Text), `parent_id` (UUID nullable FK → items), `type` (Text: 'file' / 'folder'), `s3_key` (Text UNIQUE), `status` (Text: 'pending' / 'ready' default 'pending'), `mime_type` (Text nullable), `created_at`, `updated_at` | The logical file tree. `type` discriminates files from folders. No `size` column. `status` handles the upload two-phase commit. |
| `shares` | Keep existing schema, FK → `items`. | Public short-code links with expiry. |

Key indexes:
*   `UNIQUE (garden_id, parent_id, name)` — no duplicate names in the same folder.
*   `UNIQUE (garden_id, name) WHERE parent_id IS NULL` — no duplicate names at garden root.
*   `idx_items_garden_parent` on `(garden_id, parent_id)` — fast directory listing.
*   Trigram index on `items.name` — for search.

**Task 2: Write the Supabase RLS Policies.**

| Table | Operation | Policy |
| :--- | :--- | :--- |
| `items` | SELECT | User exists in `garden_members` for the item's `garden_id`. |
| `items` | INSERT | User exists in `garden_members` with `can_upload = true`. |
| `items` | UPDATE | User exists in `garden_members` with `can_upload = true`. |
| `items` | DELETE | User exists in `garden_members` with `can_delete = true`. |
| `gardens` | ALL | User is a member with `role = 'owner'` (for mutations) or any member (for SELECT). |
| `garden_members` | ALL | User is an owner of the garden (for mutations) or the row's own `user_id` (for SELECT). |
| `shares` | SELECT | Anyone (for resolving unexpired links). Owners can manage (INSERT/DELETE). |

---

### Phase 2: Direct-to-Storage Data Plane (Presigned URLs)

**Task 1: Single-part Upload Endpoint (`POST /api/storage/presign`).**
*   Validate user's `can_upload` permission for the target `garden_id`.
*   Build s3_key from parent chain: `{garden_id}/{path/to/file}`.
*   Insert a DB row with `status: 'pending'`.
*   Generate a `PutObjectCommand` presigned URL.
*   Return `{ url, s3_key, itemId }`.

**Task 2: Upload Confirmation Endpoint (`POST /api/storage/confirm`).**
*   Verify the calling user owns the pending item.
*   Flip `status` from `pending` → `ready`.

**Task 3: Multipart Upload Endpoints.**
For files >50MB, implement the full multipart flow:
*   `POST /api/storage/multipart/create` — insert pending DB row + `CreateMultipartUploadCommand`.
*   `GET /api/storage/multipart/sign-part` — presign individual `UploadPartCommand`.
*   `GET /api/storage/multipart/list-parts` — list uploaded parts (for resumability).
*   `POST /api/storage/multipart/complete` — `CompleteMultipartUploadCommand`.
*   `DELETE /api/storage/multipart/abort` — `AbortMultipartUploadCommand` + delete pending DB row.
*   After complete, client must still call the confirm endpoint (Task 2).

**Task 4: Download Endpoint (`GET /api/storage/download`).**
*   Validate user's membership in the item's garden.
*   Generate a `GetObjectCommand` presigned URL (1hr TTL).
*   Return the URL.

**Task 5: Frontend Upload Integration.**
*   Use Uppy with the AwsS3 plugin for single-part and multipart uploads.
*   Wire `getUploadParameters` to `/api/storage/presign`.
*   Wire multipart hooks to the multipart endpoints.
*   On `onComplete`, call `/api/storage/confirm` for each uploaded file.

---

### Phase 3: The Control Plane (Upstash Workflow for Mutations)

**Task 1: Setup the Upstash Workflow Endpoints.**
*   `app/api/workflow/move/route.ts` — move items
*   `app/api/workflow/rename/route.ts` — rename folders (files can be renamed inline since it's a single copy+delete)
*   `app/api/workflow/delete/route.ts` — mass delete

All using `serve()` from `@upstash/workflow/nextjs`.

**Task 2: Implement the Folder Move Workflow.**
  * **Step 1:** `context.run("fetch-keys")` — query `items` for all descendants of the moved folder.
  * **Step 2:** Chunk into batches of 500.
  * **Step 3:** For each chunk, `context.run("copy-batch-N")` — `CopyObjectCommand` via `Promise.all()`.
  * **Step 4:** For each chunk, `context.run("delete-batch-N")` — single `DeleteObjectsCommand` for old keys.
  * **Step 5:** `context.run("update-db")` — update `s3_key` and `parent_id` in Postgres for all affected items.
  * **Step 6 (CRITICAL):** `context.call("revalidate-cache")` — HTTP POST to `/api/revalidate?tag=garden-{garden_id}`.

**Task 3: Implement the Folder Rename Workflow.**
Same pattern as move but only rewrites the s3_key prefix (no parent_id change).

**Task 4: Implement the Mass Delete Workflow.**
  * **Step 1:** `context.run("fetch-keys")` — collect all descendant s3_keys.
  * **Step 2:** `context.run("delete-db")` — delete the DB rows (CASCADE handles children).
  * **Step 3:** Chunk keys into batches of 1000.
  * **Step 4:** For each chunk, `context.run("delete-s3-batch-N")` — `DeleteObjectsCommand`.
  * **Step 5:** `context.call("revalidate-cache")`.

**Task 5: Create the Revalidation API Route (`app/api/revalidate/route.ts`).**
*   Accept a `tag` query parameter.
*   Verify the request using Upstash request signing (not a shared secret).
*   Call `revalidateTag(tag)` to purge the specific garden's cache.

**Task 6: Server Actions that trigger workflows.**
*   `moveItemAction(itemId, newParentId)` — verify `can_upload` + `can_delete`, trigger move workflow, return 202.
*   `renameItemAction(itemId, newName)` — single file: immediate S3 copy+delete+DB update. Folder: trigger rename workflow.
*   `deleteItemAction(itemId)` — verify `can_delete`, trigger delete workflow.
*   `createFolderAction(gardenId, parentId, name)` — insert DB row with `status: 'ready'`, create 0-byte S3 marker.

---

### Phase 4: Frontend & Next.js Cache Optimistic UI

**Task 1: Build the Garden Picker.**
*   Server Component that fetches gardens the user is a member of.
*   Links to `/dashboard/garden/[gardenId]`.

**Task 2: Build the Server Component File Explorer.**
*   Fetch items from Supabase directly in the Server Component.
*   Cache queries tagged with `garden-{gardenId}` using `cacheTag`.
*   Split items by `type` into folders and files.
*   Conditional UI: show/hide upload, delete, rename, move buttons based on the user's `can_upload` / `can_delete` permissions.

**Task 3: Implement React `useOptimistic`.**
*   Client Component wrapper for the file list.
*   Pass server-fetched files as initial state.
*   On move: instantly remove the item from the current view.
*   On delete: instantly remove the item.
*   On rename: instantly update the name.
*   On folder create: instantly add the new folder.

**Task 4: Implement the Server Actions.**
*   Each action verifies permissions, triggers the appropriate workflow (or does the work inline for simple ops), and does **NOT** call `revalidatePath`/`revalidateTag`. Let the Upstash Workflow revalidation webhook handle cache busting after Postgres is fully updated.

---

### Phase 5: Admin Panel

**Task 1: Admin Layout & Guard.**
*   Route group at `app/admin/` with layout that checks `garden_members.role = 'owner'` or a global admin flag.

**Task 2: User Management.**
*   List all users (admin-only via service role).
*   Delete user, link/unlink user to gardens.

**Task 3: Garden Management.**
*   Create garden, rename garden, delete garden.
*   Manage garden members: add by email, set permissions (`can_upload`, `can_delete`), remove members.

---

### Phase 6: Search

**Task 1: Trigram Index.**
*   Enable `pg_trgm` extension.
*   Create GIN index: `CREATE INDEX idx_items_name_trgm ON items USING gin (name gin_trgm_ops)`.

**Task 2: Search Endpoint / Server Action.**
*   `searchItems(gardenId, query)` — `WHERE garden_id = ? AND name ILIKE '%query%'` with RLS enforcement.
*   Return matching items with breadcrumb paths for navigation.

**Task 3: Search UI.**
*   Search input in the file explorer toolbar.
*   Results displayed as a flat list with path context, clickable to navigate to the item's parent folder.