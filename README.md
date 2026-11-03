# Supahortus 🌳

A premium, S3-powered cloud drive explorer and file management system built with Next.js 16, Supabase, and AWS S3. Supahortus (Latin for "Above the Garden") provides a sleek, high-performance interface for managing remote storage with advanced sharing capabilities.

## ✨ Key Features

- **S3 Explorer**: Navigate your S3 buckets with a familiar, fast, and responsive folder-based interface.
- **Advanced Folder Sharing**: Share specific folders with other users via email. 
- **Administrative Invitations**: Admins can invite new users to the platform directly from the sharing modal.
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

You'll need the following environment variables. Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_public_anon_key
NEXT_PRIVATE_SUPABASE_SECRET_KEY=your_secret_key

# Comma-separated Supabase user UUIDs allowed to access /admin.
# As an alternative, set app_metadata.role = "admin" or
# app_metadata.is_admin = true with the Supabase Admin API.
ADMIN_USER_IDS=your_supabase_user_uuid

# S3 Configuration
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
S3_REGION=your_region
S3_BUCKET_NAME=your_bucket_name
S3_ENDPOINT=your_optional_endpoint # e.g., for Cloudflare R2 or MinIO
```

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

### Session Management
A root-level `proxy.ts` acts as the Next.js 16 middleware, ensuring that sessions are refreshed and validated on every request without blocking public authentication routes.

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

- `/app/api/s3`: API routes for S3 operations (listing, sharing, presigned URLs)
- `/components/ui`: Core UI components including `DriveExplorer` and `Navbar`
- `/lib/supabase`: Server and Admin Supabase clients
- `/lib/s3.ts`: S3 client configuration and utility functions
- `/proxy.ts`: Next.js 16 middleware for session management

## 📄 License

This project is licensed under the MIT License.
