import "server-only";

import { GetObjectCommand, type GetObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { getThumbnailUrls, type BreadcrumbItem, type Item } from "@/lib/data";

type ShareRecord = {
  id: string;
  short_code: string;
  item_id: string;
  expires_at: string;
};

export type ItemShareContext = {
  share: ShareRecord;
  root: Item;
};

export type SharedFolderView = ItemShareContext & {
  folder: Item;
  items: Item[];
  breadcrumbs: BreadcrumbItem[];
  thumbnailUrls: Record<string, string>;
};

const SHARE_CODE_PATTERN = /^[a-zA-Z0-9_-]{8,64}$/;

export async function getItemShareContext(
  code: string,
): Promise<ItemShareContext | null> {
  if (!SHARE_CODE_PATTERN.test(code)) return null;

  const { data: share } = await supabaseAdmin
    .from("shares")
    .select("id, short_code, item_id, expires_at")
    .eq("short_code", code)
    .maybeSingle();

  if (!share || new Date(share.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const { data: root } = await supabaseAdmin
    .from("items")
    .select(
      "id, garden_id, parent_id, name, type, s3_key, thumbnail_key, mime_type, created_at",
    )
    .eq("id", share.item_id)
    .eq("status", "ready")
    .maybeSingle();

  if (!root) return null;

  return {
    share: share as ShareRecord,
    root: root as Item,
  };
}

async function isWithinSharedRoot(root: Item, item: Item): Promise<boolean> {
  if (item.garden_id !== root.garden_id) return false;
  if (item.id === root.id) return true;
  if (root.type !== "folder") return false;

  const visited = new Set<string>([item.id]);
  let parentId = item.parent_id;

  while (parentId) {
    if (parentId === root.id) return true;
    if (visited.has(parentId)) return false;
    visited.add(parentId);

    const parent = await getReadyItem(parentId);
    if (!parent || parent.garden_id !== root.garden_id) return false;
    parentId = parent.parent_id;
  }

  return false;
}

async function getReadyItem(itemId: string): Promise<Item | null> {
  const { data } = await supabaseAdmin
    .from("items")
    .select(
      "id, garden_id, parent_id, name, type, s3_key, thumbnail_key, mime_type, created_at",
    )
    .eq("id", itemId)
    .eq("status", "ready")
    .maybeSingle();

  return (data as Item) ?? null;
}

export async function getSharedFolderView(
  code: string,
  folderId?: string,
): Promise<SharedFolderView | null> {
  const context = await getItemShareContext(code);
  if (!context || context.root.type !== "folder") return null;

  const folder = folderId
    ? await getReadyItem(folderId)
    : context.root;

  if (
    !folder ||
    folder.type !== "folder" ||
    !(await isWithinSharedRoot(context.root, folder))
  ) {
    return null;
  }

  const { data } = await supabaseAdmin
    .from("items")
    .select(
      "id, garden_id, parent_id, name, type, s3_key, thumbnail_key, mime_type, created_at",
    )
    .eq("garden_id", context.root.garden_id)
    .eq("parent_id", folder.id)
    .eq("status", "ready")
    .order("type", { ascending: false })
    .order("name");

  const items = (data as Item[]) ?? [];
  const breadcrumbs = await getShareBreadcrumbs(context.root, folder);
  const imageIds = items
    .filter(
      (item) =>
        item.type === "file" &&
        /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(item.name),
    )
    .map((item) => item.id);
  const thumbnailUrls = imageIds.length
    ? await getThumbnailUrls(context.root.garden_id, imageIds)
    : {};

  return {
    ...context,
    folder,
    items,
    breadcrumbs,
    thumbnailUrls,
  };
}

async function getShareBreadcrumbs(
  root: Item,
  folder: Item,
): Promise<BreadcrumbItem[]> {
  const breadcrumbs: BreadcrumbItem[] = [{ id: folder.id, name: folder.name }];
  let current = folder;

  while (current.id !== root.id && current.parent_id) {
    const parent = await getReadyItem(current.parent_id);
    if (
      !parent ||
      parent.type !== "folder" ||
      !(await isWithinSharedRoot(root, parent))
    ) {
      return [];
    }
    breadcrumbs.unshift({ id: parent.id, name: parent.name });
    current = parent;
  }

  return current.id === root.id ? breadcrumbs : [];
}

export async function getSharedItemDownloadUrl(
  code: string,
  itemId?: string,
): Promise<string | null> {
  const context = await getItemShareContext(code);
  if (!context) return null;

  const item = itemId ? await getReadyItem(itemId) : context.root;
  if (
    !item ||
    item.type !== "file" ||
    !(await isWithinSharedRoot(context.root, item))
  ) {
    return null;
  }

  const input: GetObjectCommandInput = {
    Bucket: BUCKET_NAME,
    Key: item.s3_key,
    ResponseContentType: item.mime_type || "application/octet-stream",
    ResponseContentDisposition: contentDisposition(item.name),
  };

  return getSignedUrl(s3Client, new GetObjectCommand(input), {
    expiresIn: 900,
  });
}

function contentDisposition(filename: string): string {
  const asciiName =
    filename
      .replace(/[\u0000-\u001f\u007f"\\]/g, "_")
      .replace(/[^\x20-\x7e]/g, "_")
      .slice(0, 180) || "download";
  const encodedName = encodeURIComponent(filename).replace(/['()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}
