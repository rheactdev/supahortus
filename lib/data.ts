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
  garden_id: string;
  parent_id: string | null;
  name: string;
  type: "file" | "folder";
  s3_key: string;
  thumbnail_key: string | null;
  preview_key: string | null;
  preview_status: "pending" | "ready" | "failed" | null;
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
    .select("id, garden_id, parent_id, name, type, s3_key, thumbnail_key, preview_key, preview_status, mime_type, created_at")
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
    query = query.eq("parent_id", parentId);
  } else {
    query = query.is("parent_id", null);
  }

  const { data } = await query;
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
  "use cache";
  cacheLife("minutes");
  cacheTag(`user-search-${userId}`);

  const gardens = await getGardensForUser(userId);
  const gardenIds = gardens.map((g) => g.id);

  if (!gardenIds.length || !searchQuery) return [];

  const { data } = await supabaseAdmin
    .from("items")
    .select("id, garden_id, parent_id, name, type, s3_key, thumbnail_key, preview_key, preview_status, mime_type, created_at, gardens(name, slug)")
    .in("garden_id", gardenIds)
    .eq("status", "ready")
    .textSearch("fts", `'${searchQuery}'`, {
      type: "websearch",
      config: "english",
    })
    .order("type", { ascending: true }) // folders first
    .order("name");

  // Map permissions from the fetched gardens to the results
  const resultsWithPermissions = (
    (data as unknown as SearchItemRow[]) || []
  ).map((item) => {
    const gardenData = gardens.find((g) => g.id === item.garden_id);
    return {
      ...item,
      permissions: {
        can_upload: gardenData?.can_upload || false,
        can_delete: gardenData?.can_delete || false,
      },
    };
  });

  return resultsWithPermissions as GlobalSearchResult[];
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
  cacheTag(`breadcrumbs-${parentId ?? "root"}`);

  if (!parentId) return [];

  const crumbs: BreadcrumbItem[] = [];
  let currentId: string | null = parentId;

  while (currentId) {
    const { data }: { data: { id: string; name: string; parent_id: string | null } | null } = await supabaseAdmin
      .from("items")
      .select("id, name, parent_id")
      .eq("id", currentId)
      .eq("garden_id", gardenId)
      .single();

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

  const { data } = await supabaseAdmin
    .from("garden_members")
    .select("role, can_upload, can_delete, gardens(id, slug, name, created_by, created_at)")
    .eq("user_id", userId);

  if (!data) return [];

  return data.map((row) => {
    const garden = row.gardens as unknown as Garden;
    return {
      ...garden,
      role: row.role,
      can_upload: row.can_upload,
      can_delete: row.can_delete,
    };
  });
}

export async function getMoveTreeForUser(
  userId: string,
): Promise<MoveTreeGarden[]> {
  const { data: memberships } = await supabaseAdmin
    .from("garden_members")
    .select("can_upload, role, gardens(id, slug, name)")
    .eq("user_id", userId);

  if (!memberships?.length) return [];

  const gardens = memberships
    .map((membership) => {
      const garden = membership.gardens as unknown as {
        id: string;
        slug: string;
        name: string;
      } | null;
      if (!garden) return null;
      return {
        ...garden,
        can_upload:
          membership.role === "owner" || Boolean(membership.can_upload),
      };
    })
    .filter(
      (
        garden,
      ): garden is {
        id: string;
        slug: string;
        name: string;
        can_upload: boolean;
      } => garden !== null,
    );

  const gardenIds = gardens.map((garden) => garden.id);
  const { data: folders } = await supabaseAdmin
    .from("items")
    .select("id, garden_id, parent_id, name")
    .in("garden_id", gardenIds)
    .eq("type", "folder")
    .eq("status", "ready")
    .order("name");

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
// Cached: get user's membership for a specific garden
// ---------------------------------------------------------------------------
export async function getGardenMembership(
  gardenId: string,
  userId: string
): Promise<GardenMember | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`garden-${gardenId}`);

  const { data } = await supabaseAdmin
    .from("garden_members")
    .select("garden_id, user_id, can_upload, can_delete, role")
    .eq("garden_id", gardenId)
    .eq("user_id", userId)
    .single();

  return (data as GardenMember) || null;
}

// ---------------------------------------------------------------------------
// Cached: batch generate presigned thumbnail URLs for image files
// ---------------------------------------------------------------------------
export async function getThumbnailUrls(
  gardenId: string,
  itemIds: string[]
): Promise<Record<string, string>> {
  "use cache";
  cacheLife("hours");
  cacheTag(`garden-${gardenId}`);

  if (itemIds.length === 0) return {};

  const { data: items } = await supabaseAdmin
    .from("items")
    .select("id, s3_key, thumbnail_key, name")
    .in("id", itemIds);

  if (!items || items.length === 0) return {};

  const urlMap: Record<string, string> = {};
  await Promise.all(
    items.map(async (item) => {
      try {
        const isWebRenderable = /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(item.name);
        
        // If it has no thumbnail_key and it's not a web-renderable image, skip it
        // so it falls back to a generic file icon instead of a broken image.
        if (!item.thumbnail_key && !isWebRenderable) {
          return;
        }

        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: item.thumbnail_key || item.s3_key,
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

  const { data } = await supabaseAdmin
    .from("garden_members")
    .select("garden_id, user_id, can_upload, can_delete, role")
    .eq("garden_id", gardenId);

  if (!data || data.length === 0) return [];

  // Resolve emails via admin API
  const members = data as GardenMember[];
  const enriched: (GardenMember & { email: string })[] = [];

  for (const member of members) {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
      member.user_id
    );
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
  const { data } = await supabaseAdmin
    .from("garden_public_links")
    .select(
      "id, garden_id, token, enabled, can_upload, can_delete, created_by, created_at, updated_at",
    )
    .eq("garden_id", gardenId)
    .maybeSingle();

  return (data as GardenPublicLink) || null;
}

// ---------------------------------------------------------------------------
// Helper: get garden details by id
// ---------------------------------------------------------------------------
export async function getGarden(gardenId: string): Promise<Garden | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`garden-${gardenId}`);

  const { data } = await supabaseAdmin
    .from("gardens")
    .select("id, slug, name, created_by, created_at")
    .eq("id", gardenId)
    .single();

  return (data as Garden) || null;
}

// ---------------------------------------------------------------------------
// Helper: get garden details by slug
// ---------------------------------------------------------------------------
export async function getGardenBySlug(slug: string): Promise<Garden | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`garden-slug-${slug}`);

  const { data } = await supabaseAdmin
    .from("gardens")
    .select("id, slug, name, created_by, created_at")
    .eq("slug", slug)
    .single();

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
  // Look up the garden slug for the S3 prefix
  const { data: garden } = await supabaseAdmin
    .from("gardens")
    .select("slug")
    .eq("id", gardenId)
    .single();

  if (!garden) throw new Error("Garden not found");

  if (!parentId) {
    return `hortus/${garden.slug}/${filename}`;
  }

  const { data: parent } = await supabaseAdmin
    .from("items")
    .select("s3_key")
    .eq("id", parentId)
    .single();

  if (!parent) throw new Error("Parent folder not found");
  return `${parent.s3_key}${filename}`;
}
