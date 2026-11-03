# Supahortus 🌳

A premium, S3-powered cloud drive explorer and file management system built with Next.js 16, Supabase, and AWS S3. Supahortus (Latin for "Above the Garden") provides a sleek, high-performance interface for managing remote storage with advanced sharing capabilities.

## ✨ Key Features

- **S3 Explorer**: Navigate your S3 buckets with a familiar, fast, and responsive folder-based interface.
- **Garden and item sharing** — Garden owners can invite members by email or manage a public garden link. Individual files and folders support share links.
- **Robust Authentication**: Powered by Supabase SSR with support for Magic Links, PKCE, and persistent sessions.
- **Modern Tech Stack**: Built with Next.js 16 (App Router), Tailwind CSS v4, and DaisyUI.
- **Enterprise-ready S3 Integration**: Uses `@aws-sdk/client-s3` with presigned URLs for secure, direct-to-S3 uploads and downloads.

## 🛠 Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/)
- **Authentication**: [Supabase Auth](https://supabase.com/auth)
- **Database**: [Supabase PostgreSQL](https://supabase.com/database) (for folder permissions and user roles)
- **Storage**: [AWS S3](https://aws.amazon.com/s3/) (or compatible S3 storage)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & [DaisyUI](https://daisyui.com/)
- **Uploader**: [Uppy](https://uppy.io/) with AWS S3 plugin

## 🚀 Getting Started

### Prerequisites

Copy [`.env.example`](.env.example) to `.env.local` and fill in the Supabase, Backblaze B2, and QStash settings. Use the bare hostname for `S3_ENDPOINT`. Configure `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, and `QSTASH_NEXT_SIGNING_KEY` for background file operations, and set `UPSTASH_WORKFLOW_URL` when workers need an explicit public app origin.

For `/admin` access, set `ADMIN_USER_IDS` to a comma-separated list of Supabase user UUIDs or set `app_metadata.role` to `admin` or `app_metadata.is_admin` to `true` through the Supabase Admin API.

### Installation

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd supahortus
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Run the development server**:
   ```bash
   pnpm run dev
   ```

4. **Open the app**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🏗 Architecture

### Authentication Flow
Supahortus uses the **PKCE** flow for standard logins and **Token Hash** verification for Magic Links. The authentication lifecycle is managed by `app/api/auth/callback/route.ts` and `app/auth/confirm/route.ts`, ensuring sessions are synchronized across standard and invitation-based sign-ins.

Set the Supabase Auth Site URL to the application origin. For server-side invite acceptance, configure the **Invite user** email template to link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`. The default email link returns the session in the URL fragment, which the server callback cannot read. [Supabase email template guidance](https://supabase.com/docs/guides/auth/auth-email-templates#redirecting-the-user-to-a-server-side-endpoint)

### Session Management
The root-level `proxy.ts` validates and refreshes Supabase sessions for matched requests. The response carrying refreshed cookies also carries Supabase’s cache-prevention headers. Both auth callbacks accept same-origin destinations and default to `/my-gardens`.

This app enables Next.js Cache Components. Keep cookie reads, Supabase session validation, and request-time data access inside an async child rendered under Suspense. Use the [Next.js authentication guide for Cache Components](https://nextjs.org/docs/app/guides/authentication-with-cache-components) and the [Supabase SSR client guide](https://supabase.com/docs/guides/auth/server-side/nextjs) together.

### Gardens and storage rollout

1. Pause garden creation, deletion, and file mutations for the rollout. Let in-flight file deletion workflows finish before deploying the new workflow steps.
2. Apply the [Supabase migration](supabase/migrations/20261103000100_reserve_garden_slugs_during_cleanup.sql) before deploying the application. It backfills existing storage prefixes and installs the slug reservation and cleanup functions.
3. Deploy the application and resume writes. The legacy worker can finish queued key-list garden deletions. Drain that queue before retiring the legacy worker.

Existing gardens keep their `hortus/<slug>/` prefix. New gardens use `hortus-v2/<slug>/<garden-id>/`, so a new garden can reuse a slug without reusing the previous garden’s object keys.

When a garden is deleted, cleanup waits for existing upload URLs to expire, aborts outstanding multipart uploads, and removes current objects under the retired prefix. B2 bucket retention rules still govern historical object versions. The slug becomes available after cleanup succeeds. Admins can see pending or failed jobs and retry them from `/admin/gardens`. The B2 application key needs permission to list and abort multipart uploads as well as list and delete objects.

### S3 Security
Uploads and downloads go directly between the browser and B2 using presigned URLs. Encrypted browser reads use a service worker that intercepts only the storage transfer endpoint, adds the object-specific SSE-C headers, and streams the B2 response. The app server issues transfer credentials after checking access.

#### Retiring the preview services

Before deploying the route removal, drain or cancel queued image thumbnail and Office preview jobs in QStash. After deployment, remove `IMAGE_PROCESSOR_URL`, `PROCESSOR_SECRET`, `OFFICE_CONVERTER_URL`, and `OFFICE_CONVERTER_SECRET` from Vercel. Office files are download-only. Photoshop and Affinity files use file icons. Previously generated assets stay in B2 and are hidden in the app.

#### Backblaze B2 SSE-C rollout

1. Keep `S3_SSE_C_ACTIVE_VERSION` empty while deploying the read paths. Browsers need HTTPS or localhost for the transfer worker.
2. Check the B2 bucket CORS rules for each deployed app origin. Allow the three `x-amz-server-side-encryption-customer-*` request headers, `Range`, and the existing upload headers. Expose `ETag`, `Accept-Ranges`, and `Content-Range`. The existing `set-cors.js` allows all request headers and exposes these response headers.
3. Generate a random 32-byte master key with `openssl rand -base64 32`. Store it in deployment secrets as `S3_SSE_C_KEY_V1` or in the untracked local `.env`. Set `S3_SSE_C_ACTIVE_VERSION=V1` and redeploy. Keep a protected backup of every version. Deploy new keys to all instances before switching the active version. Version names may contain letters, digits, and underscores.
4. Verify new and legacy files, multipart retry across rotation, range previews, file shares, and moves or renames. Confirm new objects report SSE-C in B2 and inspect signed URLs and logs for key material. Pause new SSE-C uploads by clearing the active version while keeping the key ring deployed.

The app reads the key version from the reserved storage path and derives a distinct encryption key for that path. Existing objects keep their encryption mode. Admin bucket sync leaves encrypted paths to the app's upload records. Authorized browsers can see the key for an object they access. URL expiration and share revocation prevent new authorized requests through the app, while recipients can retain keys or data they already received.

## 📂 Project Structure

- `/my-gardens`, `/my-gardens/[gardenSlug]`, and `/my-gardens/[gardenSlug]/[folder]` cover the garden picker and file explorer.
- `/admin/gardens` covers garden administration, and `/admin/create-garden` is the admin-only creation form.
- `/public/g/[token]` and `/s/[code]` open public gardens and shared items.
- `/app/api/storage` contains storage route handlers. `/app/api/workflow` and `/app/api/revalidate` handle background operations and cache invalidation.
- `/lib/supabase` contains the Supabase client setup. `/lib/s3.ts` configures the S3 client, and `/proxy.ts` handles session refresh.

## 📄 License

This project is licensed under the MIT License.
