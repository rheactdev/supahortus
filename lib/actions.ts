"use server";

import { updateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
import { createClient } from "@/lib/supabase/server";
import { getGardenAccessForUser } from "@/lib/garden-access";

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
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const currentUserId = authData?.claims?.sub as string | undefined;

  if (!currentUserId || currentUserId !== userId) {
    throw new Error("Unauthorized");
  }

  const data = await getGardenAccessForUser(gardenId, userId);
  if (!data) throw new Error("No access to this garden");

  if (permission === "upload" && !data.can_upload)
    throw new Error("No upload permission");
  if (permission === "delete" && !data.can_delete)
    throw new Error("No delete permission");
  if (permission === "owner" && data.role !== "owner")
    throw new Error("Not a garden owner");

  return data;
}

async function requireCurrentUser(expectedUserId?: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const currentUserId = data?.claims?.sub;

  if (
    typeof currentUserId !== "string" ||
    (expectedUserId && currentUserId !== expectedUserId)
  ) {
    throw new Error("Unauthorized");
  }

  return currentUserId;
}

function getOrigin(reqHeaders: Headers): string {
  return reqHeaders.get("x-forwarded-proto") + "://" + reqHeaders.get("host");
}

const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

async function getGardenSlug(gardenId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("gardens")
    .select("slug")
    .eq("id", gardenId)
    .single();
  if (error || !data) throw new Error("Garden not found");
  return data.slug;
}

function s3Root(slug: string): string {
  return `hortus/${slug}/`;
}

// ---------------------------------------------------------------------------
// Create a garden
// ---------------------------------------------------------------------------
export async function createGarden(name: string, slug: string, userId: string) {
  await requireCurrentUser(userId);

  if (!name.trim()) throw new Error("Garden name is required");
  if (!slug.trim()) throw new Error("Garden slug is required");
  if (!SLUG_REGEX.test(slug)) throw new Error("Slug must be lowercase letters, numbers, and hyphens only");
  if (slug.length < 2 || slug.length > 48) throw new Error("Slug must be 2-48 characters");

  const { data: garden, error } = await supabaseAdmin
    .from("gardens")
    .insert({ name: name.trim(), slug: slug.trim(), created_by: userId })
    .select("id, slug")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("That slug is already taken");
    throw error;
  }

  // Add creator as owner with full permissions
  await supabaseAdmin.from("garden_members").insert({
    garden_id: garden.id,
    user_id: userId,
    role: "owner",
    can_upload: true,
    can_delete: true,
  });

  // Create the garden root folder marker in S3
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Root(garden.slug),
      Body: "",
    })
  );

  updateTag(`user-gardens-${userId}`);
  return { id: garden.id, slug: garden.slug };
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

  const { error } = await supabaseAdmin
    .from("gardens")
    .update({ name: newName.trim() })
    .eq("id", gardenId);

  if (error) throw error;
  updateTag(`garden-${gardenId}`);
  updateTag(`user-gardens-${userId}`);
}

// ---------------------------------------------------------------------------
// Delete a garden (owner only — cascades items, members)
// ---------------------------------------------------------------------------
export async function deleteGarden(gardenId: string, userId: string) {
  await requireMembership(gardenId, userId, "owner");

  const slug = await getGardenSlug(gardenId);

  // Collect all S3 keys before deleting from DB
  const { data: items } = await supabaseAdmin
    .from("items")
    .select("s3_key, thumbnail_key, preview_key")
    .eq("garden_id", gardenId);

  const keysToDelete = (items || []).flatMap((item) => [
    item.s3_key,
    ...(item.thumbnail_key ? [item.thumbnail_key] : []),
    ...(item.preview_key ? [item.preview_key] : []),
  ]);
  // Add the garden root marker
  keysToDelete.push(s3Root(slug));

  // Delete garden from DB (CASCADE deletes items + members)
  const { error } = await supabaseAdmin
    .from("gardens")
    .delete()
    .eq("id", gardenId);

  if (error) throw error;

  updateTag(`user-gardens-${userId}`);

  // Enqueue background S3 cleanup — garden rows are already deleted,
  // so we pass pre-collected keys directly to the delete worker
  if (keysToDelete.length > 0) {
    const reqHeaders = await headers();
    await qstashClient.publishJSON({
      url: `${getOrigin(reqHeaders)}/api/storage/delete-worker`,
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

  // Look up user by email
  const { data: userData, error: lookupError } =
    await supabaseAdmin.auth.admin.listUsers();

  if (lookupError) throw lookupError;

  const targetUser = userData.users.find((u) => u.email === email);

  if (!targetUser) {
    // Invite the user, they'll be added on first login
    const reqHeaders = await headers();
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${getOrigin(reqHeaders)}/api/auth/callback?next=/my-gardens`,
    });
    throw new Error("User invited — they must accept the invite first");
  }

  const { error } = await supabaseAdmin.from("garden_members").insert({
    garden_id: gardenId,
    user_id: targetUser.id,
    role: "member",
    can_upload: permissions.can_upload ?? false,
    can_delete: permissions.can_delete ?? false,
  });

  if (error) {
    if (error.code === "23505") throw new Error("User is already a member");
    throw error;
  }

  updateTag(`garden-${gardenId}`);
  updateTag(`user-gardens-${targetUser.id}`);
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

  const { error } = await supabaseAdmin
    .from("garden_members")
    .update(permissions)
    .eq("garden_id", gardenId)
    .eq("user_id", targetUserId);

  if (error) throw error;
  updateTag(`garden-${gardenId}`);
}

// ---------------------------------------------------------------------------
// Manage anonymous public access
// ---------------------------------------------------------------------------
export async function generateGardenPublicLink(
  gardenId: string,
  userId: string,
) {
  await requireMembership(gardenId, userId, "owner");

  const token = crypto.randomUUID().replaceAll("-", "");
  const { data: existing } = await supabaseAdmin
    .from("garden_public_links")
    .select("id, can_upload, can_delete")
    .eq("garden_id", gardenId)
    .maybeSingle();

  let publicLinkId: string;
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("garden_public_links")
      .update({ token, enabled: true })
      .eq("id", existing.id)
      .select(
        "id, garden_id, token, enabled, can_upload, can_delete, created_by, created_at, updated_at",
      )
      .single();
    if (error) throw error;
    publicLinkId = data.id;

    const { error: visitorError } = await supabaseAdmin
      .from("garden_public_visitors")
      .delete()
      .eq("public_link_id", publicLinkId);
    if (visitorError) throw visitorError;

    updateTag(`garden-${gardenId}`);
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("garden_public_links")
    .insert({
      garden_id: gardenId,
      token,
      enabled: true,
      created_by: userId,
    })
    .select(
      "id, garden_id, token, enabled, can_upload, can_delete, created_by, created_at, updated_at",
    )
    .single();

  if (error) throw error;
  updateTag(`garden-${gardenId}`);
  return data;
}

export async function updateGardenPublicLink(
  gardenId: string,
  userId: string,
  permissions: {
    enabled?: boolean;
    can_upload?: boolean;
    can_delete?: boolean;
  },
) {
  await requireMembership(gardenId, userId, "owner");

  const { data, error } = await supabaseAdmin
    .from("garden_public_links")
    .update(permissions)
    .eq("garden_id", gardenId)
    .select(
      "id, garden_id, token, enabled, can_upload, can_delete, created_by, created_at, updated_at",
    )
    .single();

  if (error) throw error;
  updateTag(`garden-${gardenId}`);
  return data;
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

  const { error } = await supabaseAdmin
    .from("garden_members")
    .delete()
    .eq("garden_id", gardenId)
    .eq("user_id", targetUserId);

  if (error) throw error;
  updateTag(`garden-${gardenId}`);
  updateTag(`user-gardens-${targetUserId}`);
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

  // Verify item exists and belongs to this garden
  const { data: item, error: fetchError } = await supabaseAdmin
    .from("items")
    .select("id, garden_id")
    .eq("id", itemId)
    .single();

  if (fetchError || !item) throw new Error("Item not found");
  if (item.garden_id !== gardenId) throw new Error("Item not in this garden");

  // Trigger durable delete workflow (handles DB + S3 + cache revalidation)
  const reqHeaders = await headers();
  await workflowClient.trigger({
    url: `${getOrigin(reqHeaders)}/api/workflow/delete`,
    body: { gardenId, itemId },
    retries: 3,
  });

  // Optimistic: invalidate cache immediately so UI reflects the delete
  updateTag(`garden-${gardenId}`);
}

export async function deleteFiles(
  itemIds: string[],
  gardenId: string,
  userId: string,
) {
  if (itemIds.length === 0) return;
  await requireMembership(gardenId, userId, "delete");

  const uniqueIds = [...new Set(itemIds)];
  const { data: items, error } = await supabaseAdmin
    .from("items")
    .select("id, garden_id, type")
    .in("id", uniqueIds);

  if (error) throw error;
  if (!items || items.length !== uniqueIds.length) {
    throw new Error("One or more files could not be found");
  }
  if (
    items.some(
      (item) => item.garden_id !== gardenId || item.type !== "file",
    )
  ) {
    throw new Error("Only files in this garden can be deleted");
  }

  const reqHeaders = await headers();
  await Promise.all(
    uniqueIds.map((itemId) =>
      workflowClient.trigger({
        url: `${getOrigin(reqHeaders)}/api/workflow/delete`,
        body: { gardenId, itemId },
        retries: 3,
      }),
    ),
  );

  updateTag(`garden-${gardenId}`);
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

  const { data: item, error: fetchError } = await supabaseAdmin
    .from("items")
    .select("id, name, s3_key, type, parent_id, garden_id")
    .eq("id", itemId)
    .single();

  if (fetchError || !item) throw new Error("Item not found");
  if (item.garden_id !== gardenId) throw new Error("Item not in this garden");

  const isFolder = item.type === "folder";

  // Compute new s3_key
  const suffix = isFolder ? `${newName}/` : newName;
  let newS3Key: string;
  if (item.parent_id) {
    const { data: parent } = await supabaseAdmin
      .from("items")
      .select("s3_key")
      .eq("id", item.parent_id)
      .single();
    newS3Key = `${parent?.s3_key || ""}${suffix}`;
  } else {
    const slug = await getGardenSlug(gardenId);
    newS3Key = `${s3Root(slug)}${suffix}`;
  }

  // Update this item's DB row immediately (fast for UI)
  const { error: updateError } = await supabaseAdmin
    .from("items")
    .update({ name: newName, s3_key: newS3Key })
    .eq("id", itemId);

  if (updateError) throw updateError;

  if (isFolder) {
    // Trigger durable rename workflow for descendants
    const reqHeaders = await headers();
    await workflowClient.trigger({
      url: `${getOrigin(reqHeaders)}/api/workflow/rename`,
      body: {
        gardenId,
        folderId: itemId,
        oldPrefix: item.s3_key,
        newPrefix: newS3Key,
      },
      retries: 3,
    });
  } else {
    // Single file: copy + delete in S3 immediately
    const encodedOldKey = item.s3_key
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: `${BUCKET_NAME}/${encodedOldKey}`,
        Key: newS3Key,
      })
    );
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: item.s3_key })
    );
  }

  updateTag(`garden-${gardenId}`);
}

// ---------------------------------------------------------------------------
// Move an item to a different folder (triggers durable workflow)
// ---------------------------------------------------------------------------
export async function moveItem(
  itemId: string,
  newParentId: string | null,
  gardenId: string,
  userId: string
) {
  // Need both upload (to create in new location) and delete (to remove from old)
  await requireMembership(gardenId, userId, "upload");
  await requireMembership(gardenId, userId, "delete");

  const { data: item, error: fetchError } = await supabaseAdmin
    .from("items")
    .select("id, garden_id, parent_id")
    .eq("id", itemId)
    .single();

  if (fetchError || !item) throw new Error("Item not found");
  if (item.garden_id !== gardenId) throw new Error("Item not in this garden");
  if (item.parent_id === newParentId) throw new Error("Already in this folder");

  // Compute the new parent's s3_key
  let newParentS3Key: string;
  if (newParentId) {
    const { data: parent } = await supabaseAdmin
      .from("items")
      .select("s3_key")
      .eq("id", newParentId)
      .single();
    if (!parent) throw new Error("Destination folder not found");
    newParentS3Key = parent.s3_key;
  } else {
    const slug = await getGardenSlug(gardenId);
    newParentS3Key = s3Root(slug);
  }

  // Trigger durable move workflow
  const reqHeaders = await headers();
  await workflowClient.trigger({
    url: `${getOrigin(reqHeaders)}/api/workflow/move`,
    body: { gardenId, itemId, newParentId, newParentS3Key },
    retries: 3,
  });

  updateTag(`garden-${gardenId}`);
}

export async function moveFiles(
  itemIds: string[],
  sourceGardenId: string,
  targetGardenId: string,
  targetParentId: string | null,
  userId: string,
) {
  if (itemIds.length === 0) return;

  await requireMembership(sourceGardenId, userId, "delete");
  await requireMembership(targetGardenId, userId, "upload");

  const uniqueIds = [...new Set(itemIds)];
  const { data: items, error: itemError } = await supabaseAdmin
    .from("items")
    .select("id, name, garden_id, parent_id, type")
    .in("id", uniqueIds);

  if (itemError) throw itemError;
  if (!items || items.length !== uniqueIds.length) {
    throw new Error("One or more files could not be found");
  }
  if (
    items.some(
      (item) =>
        item.garden_id !== sourceGardenId || item.type !== "file",
    )
  ) {
    throw new Error("Only files in the source garden can be moved");
  }
  if (
    sourceGardenId === targetGardenId &&
    items.every((item) => item.parent_id === targetParentId)
  ) {
    throw new Error("The files are already in this folder");
  }

  let targetParentS3Key: string;
  if (targetParentId) {
    const { data: parent } = await supabaseAdmin
      .from("items")
      .select("id, garden_id, s3_key, type")
      .eq("id", targetParentId)
      .single();

    if (
      !parent ||
      parent.garden_id !== targetGardenId ||
      parent.type !== "folder"
    ) {
      throw new Error("Destination folder not found");
    }
    targetParentS3Key = parent.s3_key;
  } else {
    targetParentS3Key = s3Root(await getGardenSlug(targetGardenId));
  }

  let conflictQuery = supabaseAdmin
    .from("items")
    .select("name")
    .eq("garden_id", targetGardenId)
    .in(
      "name",
      items.map((item) => item.name),
    );

  conflictQuery = targetParentId
    ? conflictQuery.eq("parent_id", targetParentId)
    : conflictQuery.is("parent_id", null);

  const { data: conflicts, error: conflictError } = await conflictQuery;
  if (conflictError) throw conflictError;

  if (conflicts?.length) {
    const names = conflicts.map((item) => item.name).join(", ");
    throw new Error(`Destination already contains: ${names}`);
  }

  const reqHeaders = await headers();
  await workflowClient.trigger({
    url: `${getOrigin(reqHeaders)}/api/workflow/move-files`,
    body: {
      sourceGardenId,
      targetGardenId,
      targetParentId,
      targetParentS3Key,
      itemIds: uniqueIds,
    },
    retries: 3,
  });

  updateTag(`garden-${sourceGardenId}`);
  if (targetGardenId !== sourceGardenId) {
    updateTag(`garden-${targetGardenId}`);
  }
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

  const s3Key = await buildS3Key(gardenId, parentId, `${name}/`);

  const { data: folder, error: insertError } = await supabaseAdmin
    .from("items")
    .insert({
      name,
      s3_key: s3Key,
      parent_id: parentId || null,
      garden_id: gardenId,
      type: "folder",
      status: "ready",
    })
    .select("id, s3_key")
    .single();

  if (insertError) throw insertError;

  // Create empty S3 object
  await s3Client.send(
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key, Body: "" })
  );

  updateTag(`garden-${gardenId}`);
  return { id: folder.id, s3Key: folder.s3_key };
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

  // Verify the item is completed and belongs to this garden.
  const { data: item } = await supabaseAdmin
    .from("items")
    .select("garden_id, status")
    .eq("id", itemId)
    .single();

  if (
    !item ||
    item.garden_id !== gardenId ||
    item.status !== "ready"
  ) {
    throw new Error("Item not found");
  }

  const shortCode = crypto.randomUUID().replaceAll("-", "");

  const { error } = await supabaseAdmin.from("shares").insert({
    short_code: shortCode,
    item_id: itemId,
    user_id: userId,
  });

  if (error) throw error;

  const reqHeaders = await headers();
  return `${getOrigin(reqHeaders)}/s/${shortCode}`;
}

// ---------------------------------------------------------------------------
// Invalidate garden cache (called from client after upload success)
// ---------------------------------------------------------------------------
export async function invalidateGardenCache(gardenId: string) {
  const userId = await requireCurrentUser();
  const access = await getGardenAccessForUser(gardenId, userId);
  if (!access) throw new Error("No access to this garden");

  updateTag(`garden-${gardenId}`);
}
