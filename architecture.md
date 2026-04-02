# Supahortus Architecture

## Stack
- Next.js App Router, Supabase (Postgres + Auth), Backblaze B2 (S3 API), Upstash Workflow
- Serverless only — no VPS

## Multi-tenant "Gardens" model (as of Phase 1 migration)
- `gardens` — tenant container, created_by FK → auth.users
- `garden_members` — composite PK (garden_id, user_id), roles: owner/member, permissions: can_upload, can_delete
- `items` — garden_id scoped, type='file'|'folder', no size column, status='pending'|'ready', s3_key is physical path
- `shares` — public short-code links with 7-day expiry
- Old `folder_shares` table dropped

## Routes (as of slug migration)
- `/admin` — admin overview
- `/admin/users` — manage users
- `/admin/gardens` — list gardens (admin)
- `/admin/gardens/[gardenSlug]` — garden settings/members
- `/admin/gardens/create-new` — create new garden
- `/my-gardens` — user's garden list
- `/my-gardens/[gardenSlug]` — file browser (root)
- `/my-gardens/[gardenSlug]/[folder]` — file browser (folder by UUID)

## S3 keys
- Physical paths: `hortus/{garden-slug}/path/to/file.jpg`
- Folders are 0-byte marker objects ending in `/`
- Root marker: `hortus/{garden-slug}/`

## RLS
- `is_garden_member(_garden_id, _permission)` — SECURITY DEFINER helper function
- Items: SELECT=any member, INSERT/UPDATE=can_upload, DELETE=can_delete
- Gardens: SELECT=any member, UPDATE/DELETE=owner, INSERT=any authenticated user
- Shares: SELECT=anyone (unexpired), INSERT=uploaders, DELETE=deleters

## Supabase project
- ID: otsdqsynwdebdyggcpoz
- Region: us-east-1
- Postgres 17
