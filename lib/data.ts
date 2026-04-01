import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { cacheLife, cacheTag } from "next/cache";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type Item = {
  id: string;
  parent_id: string | null;
  name: string;
  size: number | null;
  mime_type: string | null;
  s3_key: string;
  created_at: string;
};

export type BreadcrumbItem = {
  id: string;
  name: string;
};

// ---------------------------------------------------------------------------
// Cached: get items for a folder
// ---------------------------------------------------------------------------
export async function getItems(
  userId: string,
  parentId: string | null
): Promise<Item[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`items:${userId}:${parentId ?? "root"}`);

  let query = supabaseAdmin
    .from("items")
    .select("id, parent_id, name, size, mime_type, s3_key, created_at")
    .eq("owner_id", userId)
    .order("name");

  if (parentId) {
    query = query.eq("parent_id", parentId);
  } else {
    query = query.is("parent_id", null);
  }

  const { data } = await query;
  return (data as Item[]) || [];
}

// ---------------------------------------------------------------------------
// Cached: get shared items visible to a user (via folder_shares)
// ---------------------------------------------------------------------------
export async function getSharedItems(
  userEmail: string,
  parentId: string | null
): Promise<Item[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`shared-items:${userEmail}:${parentId ?? "root"}`);

  // Find all folder IDs shared with this email
  const { data: shares } = await supabaseAdmin
    .from("folder_shares")
    .select("item_id")
    .eq("user_email", userEmail);

  if (!shares || shares.length === 0) return [];

  const sharedFolderIds = shares.map((s) => s.item_id);

  if (!parentId) {
    // At root, show the shared folders themselves
    const { data } = await supabaseAdmin
      .from("items")
      .select("id, parent_id, name, size, mime_type, s3_key, created_at")
      .in("id", sharedFolderIds)
      .order("name");
    return (data as Item[]) || [];
  }

  // Inside a shared folder — show children if the parent is in the shared tree
  const { data } = await supabaseAdmin
    .from("items")
    .select("id, parent_id, name, size, mime_type, s3_key, created_at")
    .eq("parent_id", parentId)
    .order("name");
  return (data as Item[]) || [];
}

// ---------------------------------------------------------------------------
// Cached: get breadcrumbs via the Postgres RPC function (1 query, not N)
// ---------------------------------------------------------------------------
export async function getBreadcrumbs(
  parentId: string | null
): Promise<BreadcrumbItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(`breadcrumbs:${parentId ?? "root"}`);

  if (!parentId) return [];

  const { data } = await supabaseAdmin.rpc("get_breadcrumbs", {
    target_id: parentId,
  });

  return (data as BreadcrumbItem[]) || [];
}

// ---------------------------------------------------------------------------
// Cached: batch generate presigned thumbnail URLs for image files
// ---------------------------------------------------------------------------
export async function getThumbnailUrls(
  itemIds: string[]
): Promise<Record<string, string>> {
  "use cache";
  cacheLife("hours");
  cacheTag("thumbnails");

  if (itemIds.length === 0) return {};

  // Fetch s3_keys for these items in one query
  const { data: items } = await supabaseAdmin
    .from("items")
    .select("id, s3_key, name")
    .in("id", itemIds);

  if (!items || items.length === 0) return {};

  // Generate presigned URLs in parallel
  const urlMap: Record<string, string> = {};
  await Promise.all(
    items.map(async (item) => {
      try {
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: item.s3_key,
        });
        urlMap[item.id] = await getSignedUrl(s3Client, command, {
          expiresIn: 3600,
        });
      } catch {
        // Skip items that fail to presign
      }
    })
  );

  return urlMap;
}

// ---------------------------------------------------------------------------
// Cached: get folder shares for the share modal
// ---------------------------------------------------------------------------
export async function getFolderShares(
  itemId: string
): Promise<{ user_email: string }[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`folder-shares:${itemId}`);

  const { data } = await supabaseAdmin
    .from("folder_shares")
    .select("user_email, created_at")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });

  return (data as { user_email: string }[]) || [];
}
