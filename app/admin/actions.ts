"use server";

import { s3Client, BUCKET_NAME } from "@/lib/s3";
import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { Client } from "@upstash/qstash";
import { requireAdmin } from "@/lib/admin-access";
import { isOfficeFile, queueOfficePreview } from "@/lib/office-preview";

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

  // 1. Fetch all gardens to map slug -> id
  const { data: gardens, error: gardenError } = await supabaseAdmin
    .from("gardens")
    .select("id, slug");
  
  if (gardenError || !gardens) {
    throw new Error("Failed to fetch gardens");
  }

  const gardenMap = new Map<string, string>();
  for (const g of gardens) {
    gardenMap.set(g.slug, g.id);
  }

  // 2. Fetch all S3 objects
  let continuationToken: string | undefined = undefined;
  const s3Keys: string[] = [];

  do {
    const response: ListObjectsV2CommandOutput = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: "hortus/",
        ContinuationToken: continuationToken,
      }),
    );
    if (response.Contents) {
      for (const item of response.Contents) {
        if (item.Key) s3Keys.push(item.Key);
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  // 3. Process each S3 key to build items
  // We'll gather all existing items in DB to avoid creating duplicates
  const { data: existingItems, error: itemsError } = await supabaseAdmin
    .from("items")
    .select("id, s3_key, garden_id, parent_id");
  
  if (itemsError) throw new Error("Failed to fetch existing items");

  const existingMap = new Map<string, SyncedItem>();
  for (const item of existingItems || []) {
    existingMap.set(item.s3_key, item);
  }

  const newItemsToInsert: SyncedItem[] = [];
  
  // Sort S3 keys so we process shorter paths (parents) before longer ones (children)
  // This ensures parent folders are created before files
  s3Keys.sort();

  for (const s3Key of s3Keys) {
    // format: hortus/[slug]/...
    const parts = s3Key.split("/");
    if (parts.length < 3) continue; 
    if (parts[0] !== "hortus") continue;

    const slug = parts[1];
    const gardenId = gardenMap.get(slug);
    if (!gardenId) continue; // Skip if garden doesn't exist

    // If it's just the root marker 'hortus/[slug]/', skip
    if (parts.length === 3 && parts[2] === "") continue;

    const isFolder = s3Key.endsWith("/");
    const namePart = isFolder ? parts[parts.length - 2] : parts[parts.length - 1];
    if (!namePart) continue;

    // Ensure all intermediate parent folders exist
    let currentParentId = null;
    let currentS3Path = `hortus/${slug}/`;
    
    for (let i = 2; i < parts.length - 1; i++) {
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
    }
  }

  revalidatePath("/admin/gardens");
  
  return {
    success: true,
    addedCount: newItemsToInsert.length,
    scannedCount: s3Keys.length
  };
}

export async function generateMissingThumbnails() {
  await requireAdmin();

  const qstash = new Client({ token: process.env.QSTASH_TOKEN || "" });
  
  const { data: items, error } = await supabaseAdmin
    .from("items")
    .select("id, garden_id, name, s3_key")
    .is("thumbnail_key", null)
    .eq("type", "file");
    
  if (error || !items) throw new Error("Failed to fetch items");

  const targets = items.filter(i => /\.(psd|afdesign|afphoto|afpub|af)$/i.test(i.name));
  
  const baseUrl = process.env.UPSTASH_WORKFLOW_URL || 
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"));

  let count = 0;
  for (const item of targets) {
    await qstash.publishJSON({
      url: `${baseUrl}/api/workflow/thumbnail`,
      headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? {
        "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      } : undefined,
      body: {
        gardenId: item.garden_id,
        itemId: item.id,
        s3Key: item.s3_key,
        filename: item.name,
      },
    });
    count++;
  }
  
  return { success: true, count };
}

export async function generateMissingOfficePreviews() {
  await requireAdmin();

  const { data: items, error } = await supabaseAdmin
    .from("items")
    .select("id, garden_id, name, s3_key, preview_status")
    .eq("type", "file")
    .eq("status", "ready");

  if (error || !items) throw new Error("Failed to fetch Office documents");

  const targets = items.filter(
    (item) => isOfficeFile(item.name) && item.preview_status !== "ready",
  );

  for (const item of targets) {
    await queueOfficePreview(item);
  }

  return { success: true, count: targets.length };
}
