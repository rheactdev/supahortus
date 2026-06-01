import db from "@/db";
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
  mime_type: string | null;
  created_at: number;
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
  created_at: number;
};

export type GardenMember = {
  garden_id: string;
  user_id: string;
  can_upload: boolean;
  can_delete: boolean;
  role: "owner" | "member";
};

// ---------------------------------------------------------------------------
// Cached: get items in a folder within a garden
// ---------------------------------------------------------------------------
export async function getItems(
  gardenId: string,
  parentId: string | null
): Promise<Item[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`garden-${gardenId}`);

  let queryStr = `
    SELECT id, garden_id, parent_id, name, type, s3_key, mime_type, created_at
    FROM items
    WHERE garden_id = ? AND status = 'ready'
  `;
  const params: any[] = [gardenId];

  if (parentId) {
    queryStr += ` AND parent_id = ?`;
    params.push(parentId);
  } else {
    queryStr += ` AND parent_id IS NULL`;
  }

  queryStr += ` ORDER BY type ASC, name ASC`;

  const stmt = db.prepare(queryStr);
  return stmt.all(...params) as Item[];
}

// ---------------------------------------------------------------------------
// Cached: get breadcrumbs by walking up the parent chain
// ---------------------------------------------------------------------------
export async function getBreadcrumbs(
  parentId: string | null
): Promise<BreadcrumbItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(`breadcrumbs-${parentId ?? "root"}`);

  if (!parentId) return [];

  const crumbs: BreadcrumbItem[] = [];
  let currentId: string | null = parentId;

  const stmt = db.prepare(`SELECT id, name, parent_id FROM items WHERE id = ?`);

  while (currentId) {
    const data = stmt.get(currentId) as { id: string; name: string; parent_id: string | null } | undefined;
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

  const stmt = db.prepare(`
    SELECT gm.role, gm.can_upload, gm.can_delete, g.id, g.slug, g.name, g.created_by, g.created_at
    FROM garden_members gm
    JOIN gardens g ON gm.garden_id = g.id
    WHERE gm.user_id = ?
  `);
  
  const data = stmt.all(userId) as any[];

  return data.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    created_by: row.created_by,
    created_at: row.created_at,
    role: row.role,
    can_upload: Boolean(row.can_upload),
    can_delete: Boolean(row.can_delete),
  }));
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

  const stmt = db.prepare(`
    SELECT garden_id, user_id, can_upload, can_delete, role
    FROM garden_members
    WHERE garden_id = ? AND user_id = ?
  `);
  
  const data = stmt.get(gardenId, userId) as any;
  if (!data) return null;

  return {
    ...data,
    can_upload: Boolean(data.can_upload),
    can_delete: Boolean(data.can_delete),
  };
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

  const placeholders = itemIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT id, s3_key, name
    FROM items
    WHERE id IN (${placeholders})
  `);
  
  const items = stmt.all(...itemIds) as any[];

  if (items.length === 0) return {};

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
// Helper: get garden members with emails (for admin panel)
// ---------------------------------------------------------------------------
export async function getGardenMembers(
  gardenId: string
): Promise<(GardenMember & { email: string })[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`garden-${gardenId}`);

  const stmt = db.prepare(`
    SELECT gm.garden_id, gm.user_id, gm.can_upload, gm.can_delete, gm.role, u.email
    FROM garden_members gm
    JOIN user u ON gm.user_id = u.id
    WHERE gm.garden_id = ?
  `);
  
  const data = stmt.all(gardenId) as any[];

  return data.map((row) => ({
    garden_id: row.garden_id,
    user_id: row.user_id,
    can_upload: Boolean(row.can_upload),
    can_delete: Boolean(row.can_delete),
    role: row.role,
    email: row.email || "unknown",
  }));
}

// ---------------------------------------------------------------------------
// Helper: get garden details by id
// ---------------------------------------------------------------------------
export async function getGarden(gardenId: string): Promise<Garden | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`garden-${gardenId}`);

  const stmt = db.prepare(`
    SELECT id, slug, name, created_by, created_at
    FROM gardens
    WHERE id = ?
  `);
  
  return (stmt.get(gardenId) as Garden) || null;
}

// ---------------------------------------------------------------------------
// Helper: get garden details by slug
// ---------------------------------------------------------------------------
export async function getGardenBySlug(slug: string): Promise<Garden | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`garden-slug-${slug}`);

  const stmt = db.prepare(`
    SELECT id, slug, name, created_by, created_at
    FROM gardens
    WHERE slug = ?
  `);
  
  return (stmt.get(slug) as Garden) || null;
}

// ---------------------------------------------------------------------------
// Helper: build full s3_key from parent chain
// ---------------------------------------------------------------------------
export async function buildS3Key(
  gardenId: string,
  parentId: string | null,
  filename: string
): Promise<string> {
  const stmt = db.prepare(`SELECT slug FROM gardens WHERE id = ?`);
  const garden = stmt.get(gardenId) as any;

  if (!garden) throw new Error("Garden not found");

  if (!parentId) {
    return \`hortus/\${garden.slug}/\${filename}\`;
  }

  const parentStmt = db.prepare(`SELECT s3_key FROM items WHERE id = ?`);
  const parent = parentStmt.get(parentId) as any;

  if (!parent) throw new Error("Parent folder not found");
  return \`\${parent.s3_key}\${filename}\`;
}
