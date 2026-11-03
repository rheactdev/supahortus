import "server-only";

import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET_NAME, s3Client } from "@/lib/s3";
import { copyStorageObject } from "@/lib/storage-encryption";
import { supabaseAdmin } from "@/lib/supabase/admin";

type StoredItem = {
  id: string;
  s3_key: string;
  thumbnail_key: string | null;
};

export function replaceStoragePrefix(key: string, oldPrefix: string, newPrefix: string) {
  return key.startsWith(oldPrefix) ? newPrefix + key.slice(oldPrefix.length) : key;
}

export async function getRelocationDescendants(gardenId: string, folderId: string, prefix: string) {
  const escapedPrefix = prefix.replace(/[\\%_]/g, "\\$&");
  const pageSize = 500;
  const descendants: StoredItem[] = [];

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabaseAdmin.from("items")
      .select("id, s3_key, thumbnail_key, status").eq("garden_id", gardenId)
      .like("s3_key", `${escapedPrefix}%`).neq("id", folderId)
      .order("id").range(start, start + pageSize - 1);
    if (error) throw error;
    const page = data ?? [];
    for (const entry of page) {
      if (!entry.s3_key.startsWith(prefix)) continue;
      if (entry.status === "pending") throw new Error("Wait for pending uploads before moving or renaming this folder");
      descendants.push(entry);
    }
    if (page.length < pageSize) return descendants;
  }
}

export async function relocateStoredItem(
  item: StoredItem,
  destination: string,
  thumbnailDestination: string | null,
  changes: { name?: string; parent_id?: string | null } = {},
) {
  if (item.s3_key === destination) return;

  const { data: current, error: readError } = await supabaseAdmin.from("items")
    .select("s3_key, thumbnail_key").eq("id", item.id).single();
  if (readError || !current) throw new Error("File unavailable during relocation");

  if (current.s3_key !== destination) {
    if (current.s3_key !== item.s3_key || current.thumbnail_key !== item.thumbnail_key) {
      throw new Error("File changed during relocation");
    }

    await copyStorageObject(item.s3_key, destination);
    if (item.thumbnail_key && thumbnailDestination) {
      await copyStorageObject(item.thumbnail_key, thumbnailDestination);
    }

    let update = supabaseAdmin.from("items")
      .update({ ...changes, s3_key: destination, thumbnail_key: thumbnailDestination })
      .eq("id", item.id).eq("s3_key", item.s3_key);
    update = item.thumbnail_key ? update.eq("thumbnail_key", item.thumbnail_key) : update.is("thumbnail_key", null);
    const { data: updated, error } = await update.select("id").maybeSingle();
    if (error || !updated) throw new Error("File changed during relocation");
  } else if (current.thumbnail_key !== thumbnailDestination) {
    throw new Error("Thumbnail changed during relocation");
  }

  for (const [source, target] of [[item.s3_key, destination], [item.thumbnail_key, thumbnailDestination]]) {
    if (source && source !== target) {
      await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: source }));
    }
  }
}
