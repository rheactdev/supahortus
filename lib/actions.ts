"use server";

import { updateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { headers } from "next/headers";

// ---------------------------------------------------------------------------
// Delete an item (file or folder, with S3 cleanup)
// ---------------------------------------------------------------------------
export async function deleteItem(
  itemId: string,
  userId: string,
  parentId: string | null
) {
  // Fetch item
  const { data: item, error: fetchError } = await supabaseAdmin
    .from("items")
    .select("id, s3_key, size, owner_id")
    .eq("id", itemId)
    .single();

  if (fetchError || !item) throw new Error("Item not found");
  if (item.owner_id !== userId) throw new Error("Forbidden");

  const isFolder = item.size === null;

  if (isFolder) {
    // Collect all descendant s3_keys for S3 cleanup
    const { data: descendants } = await supabaseAdmin
      .from("items")
      .select("s3_key")
      .like("s3_key", `${item.s3_key}%`);

    const keys = (descendants || []).map((d) => d.s3_key);
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        })
      );
    }
  } else {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: item.s3_key })
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("items")
    .delete()
    .eq("id", itemId);

  if (deleteError) throw deleteError;

  // Invalidate folder listing cache
  updateTag(`items:${userId}:${parentId ?? "root"}`);
}

// ---------------------------------------------------------------------------
// Rename an item (updates DB + S3; folders enqueue background worker)
// ---------------------------------------------------------------------------
export async function renameItem(
  itemId: string,
  newName: string,
  userId: string,
  parentId: string | null
) {
  if (!newName || newName.includes("/")) throw new Error("Invalid name");

  const { data: item, error: fetchError } = await supabaseAdmin
    .from("items")
    .select("id, name, s3_key, size, parent_id, owner_id")
    .eq("id", itemId)
    .single();

  if (fetchError || !item) throw new Error("Item not found");
  if (item.owner_id !== userId) throw new Error("Forbidden");

  const isFolder = item.size === null;

  // Compute new s3_key
  let newS3Key: string;
  if (item.parent_id) {
    const { data: parent } = await supabaseAdmin
      .from("items")
      .select("s3_key")
      .eq("id", item.parent_id)
      .single();

    newS3Key = isFolder
      ? `${parent?.s3_key || ""}${newName}/`
      : `${parent?.s3_key || ""}${newName}`;
  } else {
    newS3Key = isFolder ? `${newName}/` : newName;
  }

  // Update DB
  const { error: updateError } = await supabaseAdmin
    .from("items")
    .update({ name: newName, s3_key: newS3Key })
    .eq("id", itemId);

  if (updateError) throw updateError;

  if (isFolder) {
    // Enqueue background worker for descendant key updates
    const { Client } = await import("@upstash/qstash");
    const qstash = new Client({
      baseUrl: process.env.QSTASH_URL!,
      token: process.env.QSTASH_TOKEN!,
    });
    const reqHeaders = await headers();
    const origin = reqHeaders.get("x-forwarded-proto") + "://" + reqHeaders.get("host");
    await qstash.publishJSON({
      url: `${origin}/api/s3/rename-worker`,
      body: { folderId: itemId, oldPrefix: item.s3_key, newPrefix: newS3Key },
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

  // Invalidate caches
  updateTag(`items:${userId}:${parentId ?? "root"}`);
  updateTag(`breadcrumbs:${parentId ?? "root"}`);
}

// ---------------------------------------------------------------------------
// Create a folder
// ---------------------------------------------------------------------------
export async function createFolder(
  name: string,
  userId: string,
  parentId: string | null
) {
  if (!name || name.includes("/")) throw new Error("Invalid folder name");

  // Build s3_key from parent
  let s3Key = `${name}/`;
  if (parentId) {
    const { data: parent } = await supabaseAdmin
      .from("items")
      .select("s3_key")
      .eq("id", parentId)
      .single();

    if (!parent) throw new Error("Parent folder not found");
    s3Key = `${parent.s3_key}${name}/`;
  }

  // Insert folder into DB
  const { data: folder, error: insertError } = await supabaseAdmin
    .from("items")
    .insert({
      name,
      s3_key: s3Key,
      parent_id: parentId || null,
      owner_id: userId,
    })
    .select("id, s3_key")
    .single();

  if (insertError) throw insertError;

  // Create empty S3 object
  await s3Client.send(
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key, Body: "" })
  );

  // Invalidate folder listing
  updateTag(`items:${userId}:${parentId ?? "root"}`);

  return { id: folder.id, s3Key: folder.s3_key };
}

// ---------------------------------------------------------------------------
// Share a folder with a user
// ---------------------------------------------------------------------------
export async function shareFolder(
  itemId: string,
  email: string,
  userId: string
) {
  // Verify ownership
  const { data: item } = await supabaseAdmin
    .from("items")
    .select("owner_id")
    .eq("id", itemId)
    .single();

  if (!item || item.owner_id !== userId) throw new Error("Forbidden");

  const { error: insertError } = await supabaseAdmin
    .from("folder_shares")
    .insert({ item_id: itemId, user_email: email });

  if (insertError) {
    if (insertError.code === "23505") {
      throw new Error("Already shared with this user");
    }
    throw insertError;
  }

  // Send invite email
  const reqHeaders = await headers();
  const origin = reqHeaders.get("x-forwarded-proto") + "://" + reqHeaders.get("host");
  await supabaseAdmin.auth.admin
    .inviteUserByEmail(email, {
      redirectTo: `${origin}/api/auth/callback?next=/dashboard`,
    })
    .catch((err: Error) => console.error("Invite error:", err));

  // Invalidate share list cache
  updateTag(`folder-shares:${itemId}`);
}

// ---------------------------------------------------------------------------
// Unshare a folder
// ---------------------------------------------------------------------------
export async function unshareFolder(
  itemId: string,
  email: string,
  userId: string
) {
  // Verify ownership
  const { data: item } = await supabaseAdmin
    .from("items")
    .select("owner_id")
    .eq("id", itemId)
    .single();

  if (!item || item.owner_id !== userId) throw new Error("Forbidden");

  const { error } = await supabaseAdmin
    .from("folder_shares")
    .delete()
    .eq("item_id", itemId)
    .eq("user_email", email);

  if (error) throw error;

  updateTag(`folder-shares:${itemId}`);
}

// ---------------------------------------------------------------------------
// Create a share link (public short link)
// ---------------------------------------------------------------------------
export async function createShareLink(
  itemId: string,
  userId: string
): Promise<string> {
  // Verify ownership
  const { data: item } = await supabaseAdmin
    .from("items")
    .select("owner_id")
    .eq("id", itemId)
    .single();

  if (!item || item.owner_id !== userId) throw new Error("Forbidden");

  const shortCode = crypto.randomUUID().substring(0, 8);

  const { error } = await supabaseAdmin.from("shares").insert({
    short_code: shortCode,
    item_id: itemId,
    user_id: userId,
  });

  if (error) throw error;

  const reqHeaders = await headers();
  const origin = reqHeaders.get("x-forwarded-proto") + "://" + reqHeaders.get("host");
  return `${origin}/s/${shortCode}`;
}

// ---------------------------------------------------------------------------
// Invalidate items cache (called from client after upload success)
// ---------------------------------------------------------------------------
export async function invalidateItemsCache(
  userId: string,
  parentId: string | null
) {
  updateTag(`items:${userId}:${parentId ?? "root"}`);
}

// ---------------------------------------------------------------------------
// Fetch folder shares (server action wrapper for client components)
// ---------------------------------------------------------------------------
export async function fetchFolderShares(
  itemId: string
): Promise<{ user_email: string }[]> {
  const { data } = await supabaseAdmin
    .from("folder_shares")
    .select("user_email, created_at")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });

  return (data as { user_email: string }[]) || [];
}
