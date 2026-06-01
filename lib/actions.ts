"use server";

import { updateTag } from "next/cache";
import db from "@/db";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import {
  DeleteObjectCommand,
  CopyObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { Client as WorkflowClient } from "@upstash/workflow";
import { Client as QStashClient } from "@upstash/qstash";
import { headers } from "next/headers";
import { buildS3Key } from "@/lib/data";

const workflowClient = new WorkflowClient({ token: process.env.QSTASH_TOKEN! });
const qstashClient = new QStashClient({ token: process.env.QSTASH_TOKEN! });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function requireMembership(
  gardenId: string,
  userId: string,
  permission?: "upload" | "delete" | "owner"
) {
  const stmt = db.prepare(`
    SELECT can_upload, can_delete, role
    FROM garden_members
    WHERE garden_id = ? AND user_id = ?
  `);
  const data = stmt.get(gardenId, userId) as any;

  if (!data) throw new Error("Not a member of this garden");

  if (permission === "upload" && !data.can_upload)
    throw new Error("No upload permission");
  if (permission === "delete" && !data.can_delete)
    throw new Error("No delete permission");
  if (permission === "owner" && data.role !== "owner")
    throw new Error("Not a garden owner");

  return data;
}

function getOrigin(reqHeaders: Headers): string {
  return reqHeaders.get("x-forwarded-proto") + "://" + reqHeaders.get("host");
}

const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

async function getGardenSlug(gardenId: string): Promise<string> {
  const stmt = db.prepare(`SELECT slug FROM gardens WHERE id = ?`);
  const data = stmt.get(gardenId) as any;
  if (!data) throw new Error("Garden not found");
  return data.slug;
}

function s3Root(slug: string): string {
  return \`hortus/\${slug}/\`;
}

// ---------------------------------------------------------------------------
// Create a garden
// ---------------------------------------------------------------------------
export async function createGarden(name: string, slug: string, userId: string) {
  if (!name.trim()) throw new Error("Garden name is required");
  if (!slug.trim()) throw new Error("Garden slug is required");
  if (!SLUG_REGEX.test(slug)) throw new Error("Slug must be lowercase letters, numbers, and hyphens only");
  if (slug.length < 2 || slug.length > 48) throw new Error("Slug must be 2-48 characters");

  const gardenId = crypto.randomUUID();

  try {
    const insertGarden = db.prepare(`
      INSERT INTO gardens (id, name, slug, created_by)
      VALUES (?, ?, ?, ?)
    `);
    insertGarden.run(gardenId, name.trim(), slug.trim(), userId);
  } catch (error: any) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") throw new Error("That slug is already taken");
    throw error;
  }

  // Add creator as owner with full permissions
  const insertMember = db.prepare(`
    INSERT INTO garden_members (garden_id, user_id, role, can_upload, can_delete)
    VALUES (?, ?, 'owner', 1, 1)
  `);
  insertMember.run(gardenId, userId);

  // Create the garden root folder marker in S3
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Root(slug.trim()),
      Body: "",
    })
  );

  updateTag(\`user-gardens-\${userId}\`);
  return { id: gardenId, slug: slug.trim() };
}

// ---------------------------------------------------------------------------
// Rename a garden
// ---------------------------------------------------------------------------
export async function renameGarden(
  gardenId: string,
  newName: string,
  userId: string
) {
  await requireMembership(gardenId, userId, "owner");

  const stmt = db.prepare(\`UPDATE gardens SET name = ? WHERE id = ?\`);
  stmt.run(newName.trim(), gardenId);

  updateTag(\`garden-\${gardenId}\`);
  updateTag(\`user-gardens-\${userId}\`);
}

// ---------------------------------------------------------------------------
// Delete a garden (owner only — cascades items, members)
// ---------------------------------------------------------------------------
export async function deleteGarden(gardenId: string, userId: string) {
  await requireMembership(gardenId, userId, "owner");

  const slug = await getGardenSlug(gardenId);

  // Collect all S3 keys before deleting from DB
  const itemsStmt = db.prepare(\`SELECT s3_key FROM items WHERE garden_id = ?\`);
  const items = itemsStmt.all(gardenId) as any[];

  const keysToDelete = items.map((i) => i.s3_key);
  // Add the garden root marker
  keysToDelete.push(s3Root(slug));

  // Delete garden from DB (CASCADE deletes items + members)
  const delStmt = db.prepare(\`DELETE FROM gardens WHERE id = ?\`);
  delStmt.run(gardenId);

  updateTag(\`user-gardens-\${userId}\`);

  // Enqueue background S3 cleanup
  if (keysToDelete.length > 0) {
    const reqHeaders = await headers();
    await qstashClient.publishJSON({
      url: \`\${getOrigin(reqHeaders)}/api/storage/delete-worker\`,
      body: { keys: keysToDelete },
      retries: 3,
    });
  }
}

// ---------------------------------------------------------------------------
// Add a member to a garden
// ---------------------------------------------------------------------------
export async function addGardenMember(
  gardenId: string,
  email: string,
  userId: string,
  permissions: { can_upload?: boolean; can_delete?: boolean } = {}
) {
  await requireMembership(gardenId, userId, "owner");

  // Look up user by email from better-auth user table
  const userStmt = db.prepare(\`SELECT id FROM user WHERE email = ?\`);
  const targetUser = userStmt.get(email) as any;

  if (!targetUser) {
    throw new Error("User not found — they must create an account first");
  }

  try {
    const insertStmt = db.prepare(\`
      INSERT INTO garden_members (garden_id, user_id, role, can_upload, can_delete)
      VALUES (?, ?, 'member', ?, ?)
    \`);
    insertStmt.run(
      gardenId,
      targetUser.id,
      permissions.can_upload ? 1 : 0,
      permissions.can_delete ? 1 : 0
    );
  } catch (error: any) {
    if (error.code === "SQLITE_CONSTRAINT_PRIMARYKEY") throw new Error("User is already a member");
    throw error;
  }

  updateTag(\`garden-\${gardenId}\`);
  updateTag(\`user-gardens-\${targetUser.id}\`);
}

// ---------------------------------------------------------------------------
// Update a member's permissions
// ---------------------------------------------------------------------------
export async function updateGardenMember(
  gardenId: string,
  targetUserId: string,
  userId: string,
  permissions: { can_upload?: boolean; can_delete?: boolean }
) {
  await requireMembership(gardenId, userId, "owner");

  let updates = [];
  let params = [];
  if (permissions.can_upload !== undefined) {
    updates.push("can_upload = ?");
    params.push(permissions.can_upload ? 1 : 0);
  }
  if (permissions.can_delete !== undefined) {
    updates.push("can_delete = ?");
    params.push(permissions.can_delete ? 1 : 0);
  }

  if (updates.length > 0) {
    params.push(gardenId, targetUserId);
    const stmt = db.prepare(\`
      UPDATE garden_members
      SET \${updates.join(", ")}
      WHERE garden_id = ? AND user_id = ?
    \`);
    stmt.run(...params);
  }

  updateTag(\`garden-\${gardenId}\`);
}

// ---------------------------------------------------------------------------
// Remove a member from a garden
// ---------------------------------------------------------------------------
export async function removeGardenMember(
  gardenId: string,
  targetUserId: string,
  userId: string
) {
  await requireMembership(gardenId, userId, "owner");

  // Don't let owner remove themselves
  if (targetUserId === userId) {
    throw new Error("Cannot remove yourself — transfer ownership or delete the garden");
  }

  const stmt = db.prepare(\`DELETE FROM garden_members WHERE garden_id = ? AND user_id = ?\`);
  stmt.run(gardenId, targetUserId);

  updateTag(\`garden-\${gardenId}\`);
  updateTag(\`user-gardens-\${targetUserId}\`);
}

// ---------------------------------------------------------------------------
// Delete an item (file or folder, with S3 cleanup)
// ---------------------------------------------------------------------------
export async function deleteItem(
  itemId: string,
  gardenId: string,
  userId: string
) {
  await requireMembership(gardenId, userId, "delete");

  const stmt = db.prepare(\`SELECT id, garden_id FROM items WHERE id = ?\`);
  const item = stmt.get(itemId) as any;

  if (!item) throw new Error("Item not found");
  if (item.garden_id !== gardenId) throw new Error("Item not in this garden");

  // Trigger durable delete workflow
  const reqHeaders = await headers();
  await workflowClient.trigger({
    url: \`\${getOrigin(reqHeaders)}/api/workflow/delete\`,
    body: { gardenId, itemId },
    retries: 3,
  });

  updateTag(\`garden-\${gardenId}\`);
}

// ---------------------------------------------------------------------------
// Rename an item
// ---------------------------------------------------------------------------
export async function renameItem(
  itemId: string,
  newName: string,
  gardenId: string,
  userId: string
) {
  if (!newName || newName.includes("/")) throw new Error("Invalid name");
  await requireMembership(gardenId, userId, "upload");

  const stmt = db.prepare(\`SELECT id, name, s3_key, type, parent_id, garden_id FROM items WHERE id = ?\`);
  const item = stmt.get(itemId) as any;

  if (!item) throw new Error("Item not found");
  if (item.garden_id !== gardenId) throw new Error("Item not in this garden");

  const isFolder = item.type === "folder";

  // Compute new s3_key
  const suffix = isFolder ? \`\${newName}/\` : newName;
  let newS3Key: string;
  if (item.parent_id) {
    const parentStmt = db.prepare(\`SELECT s3_key FROM items WHERE id = ?\`);
    const parent = parentStmt.get(item.parent_id) as any;
    newS3Key = \`\${parent?.s3_key || ""}\${suffix}\`;
  } else {
    const slug = await getGardenSlug(gardenId);
    newS3Key = \`\${s3Root(slug)}\${suffix}\`;
  }

  // Update immediately
  const updateStmt = db.prepare(\`UPDATE items SET name = ?, s3_key = ?, updated_at = unixepoch() WHERE id = ?\`);
  updateStmt.run(newName, newS3Key, itemId);

  if (isFolder) {
    const reqHeaders = await headers();
    await workflowClient.trigger({
      url: \`\${getOrigin(reqHeaders)}/api/workflow/rename\`,
      body: {
        gardenId,
        folderId: itemId,
        oldPrefix: item.s3_key,
        newPrefix: newS3Key,
      },
      retries: 3,
    });
  } else {
    const encodedOldKey = item.s3_key
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: \`\${BUCKET_NAME}/\${encodedOldKey}\`,
        Key: newS3Key,
      })
    );
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: item.s3_key })
    );
  }

  updateTag(\`garden-\${gardenId}\`);
}

// ---------------------------------------------------------------------------
// Move an item to a different folder
// ---------------------------------------------------------------------------
export async function moveItem(
  itemId: string,
  newParentId: string | null,
  gardenId: string,
  userId: string
) {
  await requireMembership(gardenId, userId, "upload");
  await requireMembership(gardenId, userId, "delete");

  const stmt = db.prepare(\`SELECT id, garden_id, parent_id FROM items WHERE id = ?\`);
  const item = stmt.get(itemId) as any;

  if (!item) throw new Error("Item not found");
  if (item.garden_id !== gardenId) throw new Error("Item not in this garden");
  if (item.parent_id === newParentId) throw new Error("Already in this folder");

  let newParentS3Key: string;
  if (newParentId) {
    const parentStmt = db.prepare(\`SELECT s3_key FROM items WHERE id = ?\`);
    const parent = parentStmt.get(newParentId) as any;
    if (!parent) throw new Error("Destination folder not found");
    newParentS3Key = parent.s3_key;
  } else {
    const slug = await getGardenSlug(gardenId);
    newParentS3Key = s3Root(slug);
  }

  const reqHeaders = await headers();
  await workflowClient.trigger({
    url: \`\${getOrigin(reqHeaders)}/api/workflow/move\`,
    body: { gardenId, itemId, newParentId, newParentS3Key },
    retries: 3,
  });

  updateTag(\`garden-\${gardenId}\`);
}

// ---------------------------------------------------------------------------
// Create a folder
// ---------------------------------------------------------------------------
export async function createFolder(
  name: string,
  gardenId: string,
  userId: string,
  parentId: string | null
) {
  if (!name || name.includes("/")) throw new Error("Invalid folder name");
  await requireMembership(gardenId, userId, "upload");

  const s3Key = await buildS3Key(gardenId, parentId, \`\${name}/\`);
  const folderId = crypto.randomUUID();

  const stmt = db.prepare(\`
    INSERT INTO items (id, name, s3_key, parent_id, garden_id, type, status)
    VALUES (?, ?, ?, ?, ?, 'folder', 'ready')
  \`);
  stmt.run(folderId, name, s3Key, parentId || null, gardenId);

  await s3Client.send(
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key, Body: "" })
  );

  updateTag(\`garden-\${gardenId}\`);
  return { id: folderId, s3Key };
}

// ---------------------------------------------------------------------------
// Create a share link (public short link)
// ---------------------------------------------------------------------------
export async function createShareLink(
  itemId: string,
  gardenId: string,
  userId: string
): Promise<string> {
  await requireMembership(gardenId, userId, "upload");

  const itemStmt = db.prepare(\`SELECT garden_id FROM items WHERE id = ?\`);
  const item = itemStmt.get(itemId) as any;

  if (!item || item.garden_id !== gardenId) throw new Error("Item not found");

  const shortCode = crypto.randomUUID().substring(0, 8);
  const shareId = crypto.randomUUID();
  // 7 days from now
  const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  const stmt = db.prepare(\`
    INSERT INTO shares (id, short_code, item_id, user_id, expires_at)
    VALUES (?, ?, ?, ?, ?)
  \`);
  stmt.run(shareId, shortCode, itemId, userId, expiresAt);

  const reqHeaders = await headers();
  return \`\${getOrigin(reqHeaders)}/s/\${shortCode}\`;
}

// ---------------------------------------------------------------------------
// Invalidate garden cache (called from client after upload success)
// ---------------------------------------------------------------------------
export async function invalidateGardenCache(gardenId: string) {
  updateTag(\`garden-\${gardenId}\`);
}
