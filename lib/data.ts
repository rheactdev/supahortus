import { getGardenStoragePrefix } from "@/lib/garden-storage";
import { isEncryptedObject } from "@/lib/storage-encryption";
import { storageTransferUrl } from "@/lib/storage-transfer-url";
import { canHaveThumbnail, getCardThumbnailKey } from "@/lib/thumbnail-types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { cacheLife, cacheTag } from "next/cache";
import type { PostgrestError } from "@supabase/supabase-js";

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type Item = {
  id: string;
  garden_id: string;
  parent_id: string | null;
  name: string;
  type: "file" | "folder";
  s3_key: string;
  thumbnail_key?: string | null;
  card_thumbnail_key?: string | null;
  mime_type: string | null;
  created_at: string;
};

export type BreadcrumbItem = {
  id: string;
  name: string;
};

export type Garden = {
  id: string;
  slug: string;
  name: string;
  created_by: string;
  created_at: string;
};

export type GardenMember = {
  garden_id: string;
  user_id: string;
  can_upload: boolean;
  can_delete: boolean;
  role: "owner" | "member";
};

export type GardenPublicLink = {
  id: string;
  garden_id: string;
  token: string;
  enabled: boolean;
  can_upload: boolean;
  can_delete: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type MoveTreeFolder = {
  id: string;
  name: string;
  children: MoveTreeFolder[];
};

export type MoveTreeGarden = {
  id: string;
  slug: string;
  name: string;
  can_upload: boolean;
  folders: MoveTreeFolder[];
};

// ---------------------------------------------------------------------------
// Cached: get items in a folder within a garden
// ---------------------------------------------------------------------------
export async function getItems(
  gardenId: string,
  parentId: string | null,
  searchQuery?: string
): Promise<Item[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`garden-${gardenId}`);

  let query = supabaseAdmin
    .from("items")
    .select("id, garden_id, parent_id, name, type, s3_key, card_thumbnail_key, mime_type, created_at")
    .eq("garden_id", gardenId)
    .eq("status", "ready")
    .order("type", { ascending: true }) // folders first
    .order("name");

  if (searchQuery) {
    query = query.textSearch("fts", `'${searchQuery}'`, {
      type: "websearch",
      config: "english"
    });
  } else if (parentId) {
    if (!UUID_PATTERN.test(parentId)) return [];
    query = query.eq("parent_id", parentId);
  } else {
    query = query.is("parent_id", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as Item[]) || [];
}

// ---------------------------------------------------------------------------
// Cached: search across all accessible gardens
// ---------------------------------------------------------------------------
export type GlobalSearchResult = Item & {
  gardens: {
    name: string;
    slug: string;
  };
  permissions: {
    can_upload: boolean;
    can_delete: boolean;
  };
};

type SearchItemRow = Item & {
  gardens: {
    name: string;
    slug: string;
  };
};

export async function searchAllItems(
  userId: string,
  searchQuery: string
): Promise<GlobalSearchResult[]> {
  if (!searchQuery) return [];

  const gardens = await readGardensForUser(userId);
  const permissions = new Map(gardens.map((garden) => [garden.id, {
    can_upload: garden.can_upload,
    can_delete: garden.can_delete,
  }]));
  const gardenIds = [...permissions.keys()].sort();
  if (!gardenIds.length) return [];

  // Next.js supports up to 128 tags per cached result.
  const items = gardenIds.length <= 128
    ? await searchCachedGardenItems(gardenIds, searchQuery)
    : await searchGardenItems(gardenIds, searchQuery);

  return items.map((item) => ({
    ...item,
    permissions: permissions.get(item.garden_id)!,
  }));
}

async function searchCachedGardenItems(gardenIds: string[], searchQuery: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(...gardenIds.map((id) => `garden-${id}`));
  return searchGardenItems(gardenIds, searchQuery);
}

async function searchGardenItems(
  gardenIds: string[],
  searchQuery: string,
): Promise<SearchItemRow[]> {
  const { data, error } = await supabaseAdmin
    .from("items")
    .select("id, garden_id, parent_id, name, type, s3_key, card_thumbnail_key, mime_type, created_at, gardens(name, slug)")
    .in("garden_id", gardenIds)
    .eq("status", "ready")
    .textSearch("fts", `'${searchQuery}'`, {
      type: "websearch",
      config: "english",
    })
    .order("type", { ascending: true }) // folders first
    .order("name");

  if (error) throw error;
  return (data ?? []) as unknown as SearchItemRow[];
}

// ---------------------------------------------------------------------------
// Cached: get breadcrumbs by walking up the parent chain
// ---------------------------------------------------------------------------
export async function getBreadcrumbs(
  gardenId: string,
  parentId: string | null
): Promise<BreadcrumbItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(`garden-${gardenId}`);

  if (!parentId || !UUID_PATTERN.test(parentId)) return [];

  const crumbs: BreadcrumbItem[] = [];
  let currentId: string | null = parentId;

  while (currentId) {
    const { data, error }: {
      data: { id: string; name: string; parent_id: string | null } | null;
      error: PostgrestError | null;
    } = await supabaseAdmin
      .from("items")
      .select("id, name, parent_id")
      .eq("id", currentId)
      .eq("garden_id", gardenId)
      .maybeSingle();

    if (error) throw error;
    if (!data) break;
    crumbs.unshift({ id: data.id, name: data.name });
    currentId = data.parent_id;
  }

  return crumbs;
}

// ---------------------------------------------------------------------------
// Cached: get gardens for a user
// ---------------------------------------------------------------------------
export async function getGardensForUser(
  userId: string
): Promise<(Garden & { role: string; can_upload: boolean; can_delete: boolean })[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`user-gardens-${userId}`);
  return readGardensForUser(userId);
}

async function readGardensForUser(userId: string) {
  const gardens: (Garden & { role: string; can_upload: boolean; can_delete: boolean })[] = [];
  const pageSize = 500;
  for (let offset = 0; ; ) {
    const { data, error } = await supabaseAdmin
      .from("garden_members")
      .select("role, can_upload, can_delete, gardens!inner(id, slug, name, created_by, created_at)")
      .eq("user_id", userId)
      .order("garden_id")
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    if (!data?.length) return gardens;

    for (const row of data) {
      gardens.push({
        ...(row.gardens as unknown as Garden),
        role: row.role,
        can_upload: row.can_upload,
        can_delete: row.can_delete,
      });
    }
    offset += data.length;
  }
}

export async function getMoveTreeForUser(
  userId: string,
): Promise<MoveTreeGarden[]> {
  const gardens = (await readGardensForUser(userId)).map((garden) => ({
    id: garden.id,
    slug: garden.slug,
    name: garden.name,
    can_upload: garden.role === "owner" || Boolean(garden.can_upload),
  }));
  if (!gardens.length) return [];

  const gardenIds = gardens.map((garden) => garden.id);
  const { data: folders, error } = await supabaseAdmin
    .from("items")
    .select("id, garden_id, parent_id, name")
    .in("garden_id", gardenIds)
    .eq("type", "folder")
    .eq("status", "ready")
    .order("name");
  if (error) throw error;

  const foldersByGarden = new Map<string, MoveTreeFolder[]>();

  for (const garden of gardens) {
    const gardenFolders = (folders ?? []).filter(
      (folder) => folder.garden_id === garden.id,
    );
    const nodes = new Map<string, MoveTreeFolder>();
    const roots: MoveTreeFolder[] = [];

    for (const folder of gardenFolders) {
      nodes.set(folder.id, {
        id: folder.id,
        name: folder.name,
        children: [],
      });
    }

    for (const folder of gardenFolders) {
      const node = nodes.get(folder.id);
      if (!node) continue;
      const parent = folder.parent_id ? nodes.get(folder.parent_id) : null;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    foldersByGarden.set(garden.id, roots);
  }

  return gardens
    .map((garden) => ({
      ...garden,
      folders: foldersByGarden.get(garden.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Request-time authorization for a specific garden
// ---------------------------------------------------------------------------
export async function getGardenMembership(
  gardenId: string,
  userId: string
): Promise<GardenMember | null> {
  const { data, error } = await supabaseAdmin
    .from("garden_members")
    .select("garden_id, user_id, can_upload, can_delete, role")
    .eq("garden_id", gardenId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as GardenMember) || null;
}

// ---------------------------------------------------------------------------
// Generate fresh presigned thumbnail URLs for image files
// ---------------------------------------------------------------------------
export async function getThumbnailUrls(
  gardenId: string,
  itemIds: string[],
  share?: string,
): Promise<Record<string, string>> {
  if (itemIds.length === 0) return {};

  const { data: items, error } = await supabaseAdmin
    .from("items")
    .select("id, s3_key, card_thumbnail_key, thumbnail_key, name")
    .eq("garden_id", gardenId)
    .eq("type", "file")
    .eq("status", "ready")
    .in("id", itemIds);

  if (error) throw error;
  if (!items || items.length === 0) return {};

  const urlMap: Record<string, string> = {};
  await Promise.all(
    items.map(async (item) => {
      try {
        if (!canHaveThumbnail(item.name)) return;

        const key = getCardThumbnailKey(item);
        if (!key) return;
        if (isEncryptedObject(key)) {
          urlMap[item.id] = storageTransferUrl(item.id, "thumbnail", { share });
          return;
        }
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
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
// Helper: get garden members with emails (for admin panel)
// ---------------------------------------------------------------------------
export async function getGardenMembers(
  gardenId: string
): Promise<(GardenMember & { email: string })[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`garden-${gardenId}`);

  const { data, error } = await supabaseAdmin
    .from("garden_members")
    .select("garden_id, user_id, can_upload, can_delete, role")
    .eq("garden_id", gardenId);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Resolve emails via admin API
  const members = data as GardenMember[];
  const enriched: (GardenMember & { email: string })[] = [];

  for (const member of members) {
    const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(
      member.user_id
    );
    if (error) throw error;
    enriched.push({
      ...member,
      email: userData?.user?.email ?? "unknown",
    });
  }

  return enriched;
}

export async function getGardenPublicLink(
  gardenId: string,
): Promise<GardenPublicLink | null> {
  const { data, error } = await supabaseAdmin
    .from("garden_public_links")
    .select(
      "id, garden_id, token, enabled, can_upload, can_delete, created_by, created_at, updated_at",
    )
    .eq("garden_id", gardenId)
    .maybeSingle();

  if (error) throw error;
  return (data as GardenPublicLink) || null;
}

// ---------------------------------------------------------------------------
// Helper: get garden details by id
// ---------------------------------------------------------------------------
export async function getGarden(gardenId: string): Promise<Garden | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`garden-${gardenId}`);

  const { data, error } = await supabaseAdmin
    .from("gardens")
    .select("id, slug, name, created_by, created_at")
    .eq("id", gardenId)
    .maybeSingle();

  if (error) throw error;
  if (data) cacheTag(`garden-slug-${data.slug}`);
  return (data as Garden) || null;
}

// ---------------------------------------------------------------------------
// Helper: get garden details by slug
// ---------------------------------------------------------------------------
export async function getGardenBySlug(slug: string): Promise<Garden | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`garden-slug-${slug}`);

  const { data, error } = await supabaseAdmin
    .from("gardens")
    .select("id, slug, name, created_by, created_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  if (data) cacheTag(`garden-${data.id}`);
  return (data as Garden) || null;
}

// ---------------------------------------------------------------------------
// Helper: build full s3_key from parent chain
// ---------------------------------------------------------------------------
export async function buildS3Key(
  gardenId: string,
  parentId: string | null,
  filename: string
): Promise<string> {
  if (!parentId) return `${await getGardenStoragePrefix(gardenId)}${filename}`;

  const { data: parent } = await supabaseAdmin
    .from("items")
    .select("s3_key")
    .eq("id", parentId)
    .eq("garden_id", gardenId)
    .eq("type", "folder")
    .eq("status", "ready")
    .single();

  if (!parent) throw new Error("Parent folder not found");
  return `${parent.s3_key}${filename}`;
}
