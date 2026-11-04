"use server";

import { preserveUploadKeyMarker, relocatedThumbnailKey } from "@/lib/storage-encryption";

import { relocateStoredItem } from "@/lib/storage-relocation";
import { updateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { Client as WorkflowClient } from "@upstash/workflow";
import { headers } from "next/headers";
import { buildS3Key, type GardenPublicLink } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { getGardenAccessForUser } from "@/lib/garden-access";
import { requireAdmin } from "@/lib/admin-access";
import { getGardenStoragePrefix } from "@/lib/garden-storage";
import { enqueueGardenCleanup } from "@/lib/garden-cleanup";

const workflowClient = new WorkflowClient({ token: process.env.QSTASH_TOKEN! });

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

function getOrigin(reqHeaders: Headers): string {
  const protocol = reqHeaders.get("x-forwarded-proto") === "http" ||
    (!reqHeaders.has("x-forwarded-proto") && process.env.NODE_ENV !== "production")
    ? "http"
    : "https";
  return `${protocol}://${reqHeaders.get("host")}`;
}

const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

// ---------------------------------------------------------------------------
// Create a garden
// ---------------------------------------------------------------------------
export async function createGarden(name: string, slug: string): Promise<
  { ok: true; id: string; slug: string } | { ok: false; error: string }
> {
  const userId = await requireAdmin();

  if (typeof name !== "string" || !name.trim()) {
    return { ok: false, error: "Garden name is required" };
  }
  if (typeof slug !== "string" || !SLUG_REGEX.test(slug)) {
    return { ok: false, error: "Slug must be lowercase letters, numbers, and hyphens only" };
  }
  if (slug.length < 2 || slug.length > 48) {
    return { ok: false, error: "Slug must be 2-48 characters" };
  }

  const { data: garden, error } = await supabaseAdmin
    .rpc("create_garden_with_slug_reservation", {
      p_name: name.trim(),
      p_slug: slug,
      p_user_id: userId,
    })
    .returns<{ id: string; slug: string }[]>()
    .single();

  if (error?.code === "23505") {
    return { ok: false, error: "That slug is already taken" };
  }
  if (error?.message === "Garden slug cleanup is pending") {
    return { ok: false, error: "That slug is reserved until garden cleanup finishes" };
  }
  if (error || !garden) {
    console.error("[create-garden] Could not create garden", error);
    return { ok: false, error: "Failed to create garden" };
  }

  updateTag(`user-gardens-${userId}`);
  updateTag(`garden-slug-${garden.slug}`);
  return { ok: true, id: garden.id, slug: garden.slug };
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

  const memberIds: string[] = [];
  const pageSize = 500;
  for (let offset = 0; ; ) {
    const { data, error } = await supabaseAdmin
      .from("garden_members")
      .select("user_id")
      .eq("garden_id", gardenId)
      .order("user_id")
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;
    memberIds.push(...data.map(({ user_id }) => user_id));
    offset += data.length;
  }

  const { data: garden, error } = await supabaseAdmin
    .from("gardens")
    .update({ name: newName.trim() })
    .eq("id", gardenId)
    .select("slug")
    .single();

  if (error) throw error;
  updateTag(`garden-slug-${garden.slug}`);
  updateTag(`garden-${gardenId}`);
  for (const memberId of memberIds) updateTag(`user-gardens-${memberId}`);
}

// ---------------------------------------------------------------------------
// Delete a garden (owner only — cascades items, members)
// ---------------------------------------------------------------------------
export async function deleteGarden(gardenId: string, userId: string) {
  await requireMembership(gardenId, userId, "owner");

  const { data: deletion, error } = await supabaseAdmin
    .rpc("begin_garden_deletion", { p_garden_id: gardenId, p_user_id: userId })
    .returns<{ slug: string; member_ids: string[] }[]>()
    .single();

  if (error || !deletion) {
    console.error("[delete-garden] Could not record deletion", error);
    throw new Error("Failed to delete garden");
  }

  updateTag(`garden-${gardenId}`);
  updateTag(`garden-slug-${deletion.slug}`);
  for (const memberId of deletion.member_ids) {
    updateTag(`user-gardens-${memberId}`);
  }

  await enqueueGardenCleanup(gardenId);
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

  const normalizedEmail = email.trim().toLowerCase();
  const pageSize = 50;
  let targetUserId: string | undefined;
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw error;

    targetUserId = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail)?.id;
    if (targetUserId || data.users.length < pageSize) break;
  }

  if (!targetUserId) {
    const reqHeaders = await headers();
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo: `${getOrigin(reqHeaders)}/api/auth/callback?next=/my-gardens`,
    });
    if (error) return { error: `Could not send the invitation. ${error.message}` };
    if (!data.user?.id) return { error: "The invitation did not return a user ID." };
    targetUserId = data.user.id;
  }

  const { error } = await supabaseAdmin.from("garden_members").insert({
    garden_id: gardenId,
    user_id: targetUserId,
    role: "member",
    can_upload: permissions.can_upload ?? false,
    can_delete: permissions.can_delete ?? false,
  });

  if (error) {
    if (error.code === "23505") throw new Error("User is already a member");
    throw error;
  }

  updateTag(`garden-${gardenId}`);
  updateTag(`user-gardens-${targetUserId}`);
  return { error: null };
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
  updateTag(`user-gardens-${targetUserId}`);
}

// ---------------------------------------------------------------------------
// Manage anonymous public access
// ---------------------------------------------------------------------------
export async function generateGardenPublicLink(
  gardenId: string,
  userId: string,
) {
  await requireMembership(gardenId, userId, "owner");

  const { data, error } = await supabaseAdmin
    .rpc("rotate_garden_public_link", {
      p_garden_id: gardenId,
      p_user_id: userId,
      p_token: crypto.randomUUID().replaceAll("-", ""),
    })
    .returns<GardenPublicLink[]>()
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
  if (!newName || newName.includes("/") || newName.startsWith(".ssec~")) throw new Error("Invalid name");
  await requireMembership(gardenId, userId, "upload");

  const { data: item, error: fetchError } = await supabaseAdmin
    .from("items")
    .select("id, name, s3_key, type, parent_id, garden_id, thumbnail_key, card_thumbnail_key")
    .eq("id", itemId)
    .eq("status", "ready")
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
      .eq("garden_id", gardenId)
      .eq("type", "folder")
      .single();
    if (!parent) throw new Error("Parent folder not found");
    newS3Key = `${parent.s3_key}${suffix}`;
  } else {
    newS3Key = `${await getGardenStoragePrefix(gardenId)}${suffix}`;
  }

  if (isFolder && newS3Key === item.s3_key) return;

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
        newName,
      },
      retries: 3,
    });
  } else {
    newS3Key = preserveUploadKeyMarker(item.s3_key, newS3Key);
    if (newS3Key === item.s3_key) return;
    const thumbnailKey = item.thumbnail_key && relocatedThumbnailKey(item.thumbnail_key, newS3Key, item.id);
    await relocateStoredItem(item, newS3Key, thumbnailKey, { name: newName });
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
      .eq("garden_id", gardenId)
      .eq("type", "folder")
      .eq("status", "ready")
      .single();
    if (!parent) throw new Error("Destination folder not found");
    newParentS3Key = parent.s3_key;
  } else {
    newParentS3Key = await getGardenStoragePrefix(gardenId);
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
      .eq("status", "ready")
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
    targetParentS3Key = await getGardenStoragePrefix(targetGardenId);
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

  const folder = await insertFolder(name, gardenId, parentId);
  updateTag(`garden-${gardenId}`);
  return { id: folder.id, s3Key: folder.s3_key };
}

async function insertFolder(
  name: string,
  gardenId: string,
  parentId: string | null,
  prepareMarkerFirst = false,
) {
  const s3Key = await buildS3Key(gardenId, parentId, `${name}/`);
  const marker = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key, Body: "" });

  // Imports can reuse a ready row immediately, so publish it after the marker is ready.
  if (prepareMarkerFirst) await s3Client.send(marker);

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
  if (!prepareMarkerFirst) await s3Client.send(marker);
  return folder;
}

async function findFolderImportEntry(gardenId: string, parentId: string | null, name: string) {
  const query = supabaseAdmin.from("items").select("id, type, status")
    .eq("garden_id", gardenId).eq("name", name);
  const { data, error } = await (parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null))
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function prepareFolderUpload(
  gardenId: string,
  userId: string,
  parentId: string | null,
  directoryPaths: string[],
): Promise<{ folderIds: Record<string, string>; created: boolean; error?: never } |
  { error: string; created: boolean; folderIds?: never }> {
  let created = false;
  let currentPath = "";

  try {
    await requireMembership(gardenId, userId, "upload");
    if ((parentId !== null && (typeof parentId !== "string" || !parentId)) ||
        !Array.isArray(directoryPaths) || directoryPaths.length === 0) {
      return { error: "Invalid folder upload destination or paths", created };
    }
    await buildS3Key(gardenId, parentId, "");

    const paths = new Set<string>();
    for (const path of directoryPaths) {
      if (typeof path !== "string") return { error: "Invalid folder path", created };
      let prefix = "";
      for (const name of path.split("/")) {
        if (!name || name === "." || name === ".." || name.includes("\\") || name.includes("\0")) {
          return { error: `Invalid folder path: ${path}`, created };
        }
        prefix = prefix ? `${prefix}/${name}` : name;
        paths.add(prefix);
      }
    }

    const folderIds = new Map<string, string>();
    for (const path of paths) {
      currentPath = path;
      const separator = path.lastIndexOf("/");
      const destination = separator < 0 ? parentId : folderIds.get(path.slice(0, separator))!;
      const name = path.slice(separator + 1);
      let entry = await findFolderImportEntry(gardenId, destination, name);
      if (!entry) {
        try {
          const folder = await insertFolder(name, gardenId, destination, true);
          created = true;
          folderIds.set(path, folder.id);
          continue;
        } catch (error) {
          if (!(error && typeof error === "object" && "code" in error && error.code === "23505")) throw error;
          entry = await findFolderImportEntry(gardenId, destination, name);
          if (!entry) throw error;
        }
      }

      if (entry.type !== "folder" || entry.status !== "ready") {
        return { error: `Cannot import “${path}”. An existing file or unavailable folder blocks this path.`, created };
      }
      folderIds.set(path, entry.id);
    }

    return { folderIds: Object.fromEntries(folderIds), created };
  } catch (error) {
    if (currentPath) return { error: `Could not prepare “${currentPath}”. Try uploading again.`, created };
    return { error: error instanceof Error ? error.message : "Could not prepare folder upload", created };
  } finally {
    if (created) updateTag(`garden-${gardenId}`);
  }
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

