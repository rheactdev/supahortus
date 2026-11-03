"use server";

import { isEncryptedObject } from "@/lib/storage-transfer-url";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-access";
import { enqueueGardenCleanup } from "@/lib/garden-cleanup";

type SyncedItem = {
  id: string;
  garden_id: string;
  parent_id: string | null;
  name?: string;
  type?: "file" | "folder";
  s3_key: string;
  status?: "ready";
};

export async function syncS3ToDb() {
  await requireAdmin();

  // 1. Match objects to the garden that owns their storage prefix.
  const { data: gardens, error: gardenError } = await supabaseAdmin
    .from("gardens")
    .select("id, storage_prefix");
  
  if (gardenError || !gardens) {
    throw new Error("Failed to fetch gardens");
  }

  const gardenMap = new Map<string, string>();
  for (const g of gardens) {
    gardenMap.set(g.storage_prefix, g.id);
  }

  // 2. Fetch all S3 objects
  const s3Keys: string[] = [];

  for (const namespace of ["hortus/", "hortus-v2/"]) {
    let continuationToken: string | undefined;
    do {
      const response: ListObjectsV2CommandOutput = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: namespace,
          ContinuationToken: continuationToken,
        }),
      );
      for (const item of response.Contents ?? []) {
        if (item.Key) s3Keys.push(item.Key);
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
  }

  // 3. Index originals and derivative references before importing bucket objects.
  const existingMap = new Map<string, SyncedItem>();
  const derivativeKeys = new Set<string>();
  const pageSize = 500;

  for (let start = 0; ; start += pageSize) {
    const { data: items, error } = await supabaseAdmin
      .from("items")
      .select("id, s3_key, garden_id, parent_id, thumbnail_key, preview_key")
      .order("id")
      .range(start, start + pageSize - 1);
    if (error || !items) throw new Error("Failed to fetch existing items");

    for (const item of items) {
      existingMap.set(item.s3_key, item);
      if (item.thumbnail_key) derivativeKeys.add(item.thumbnail_key);
      if (item.preview_key) derivativeKeys.add(item.preview_key);
    }
    if (items.length < pageSize) break;
  }

  const newItemsToInsert: SyncedItem[] = [];
  
  // Sort S3 keys so we process shorter paths (parents) before longer ones (children)
  // This ensures parent folders are created before files
  s3Keys.sort();

  for (const s3Key of s3Keys) {
    // Keep generated assets and encrypted uploads out of the legacy import.
    if (isEncryptedObject(s3Key) || derivativeKeys.has(s3Key)) continue;
    const parts = s3Key.split("/");
    const prefixDepth = parts[0] === "hortus-v2" ? 3 : 2;
    const prefix = parts.slice(0, prefixDepth).join("/") + "/";
    const gardenId = gardenMap.get(prefix);
    if (!gardenId) continue;

    if (!s3Key.startsWith(prefix) || s3Key === prefix) continue;

    const isFolder = s3Key.endsWith("/");
    const namePart = isFolder ? parts[parts.length - 2] : parts[parts.length - 1];
    if (!namePart) continue;

    // Ensure all intermediate parent folders exist
    let currentParentId = null;
    let currentS3Path = prefix;
    
    for (let i = prefixDepth; i < parts.length - 1; i++) {
      const folderName = parts[i];
      currentS3Path += `${folderName}/`;
      
      let folderItem = existingMap.get(currentS3Path);
      if (!folderItem) {
        const id = crypto.randomUUID();
        folderItem = {
          id,
          garden_id: gardenId,
          parent_id: currentParentId,
          name: folderName,
          type: "folder",
          s3_key: currentS3Path,
          status: "ready",
        };
        newItemsToInsert.push(folderItem);
        existingMap.set(currentS3Path, folderItem);
      }
      currentParentId = folderItem.id;
    }

    // Skip .bzEmpty zero-byte files (we already synthesized their parent folders above)
    if (!isFolder && namePart === ".bzEmpty") continue;

    if (!existingMap.has(s3Key)) {
      const id = crypto.randomUUID();
      const newItem: SyncedItem = {
        id,
        garden_id: gardenId,
        parent_id: currentParentId,
        name: namePart,
        type: isFolder ? "folder" : "file",
        s3_key: s3Key,
        status: "ready",
      };
      newItemsToInsert.push(newItem);
      existingMap.set(s3Key, newItem); // make it available as parent for next items
    }
  }

  // 4. Batch insert new items
  if (newItemsToInsert.length > 0) {
    // Insert in chunks of 500
    for (let i = 0; i < newItemsToInsert.length; i += 500) {
      const chunk = newItemsToInsert.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("items").insert(chunk);
      if (error) {
        console.error("Failed to insert chunk", error);
        throw new Error("Failed to insert chunk: " + error.message);
      }
      for (const gardenId of new Set(chunk.map((item) => item.garden_id))) {
        updateTag(`garden-${gardenId}`);
      }
    }
  }

  revalidatePath("/admin/gardens");
  
  return {
    success: true,
    addedCount: newItemsToInsert.length,
    scannedCount: s3Keys.length
  };
}

export async function retryGardenCleanup(gardenId: string) {
  await requireAdmin();
  await enqueueGardenCleanup(gardenId);
  revalidatePath("/admin/gardens");
}
