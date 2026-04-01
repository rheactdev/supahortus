import { NextResponse } from "next/server";
import { ListObjectsV2Command, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Receiver } from "@upstash/qstash";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { supabaseAdmin } from "@/lib/supabase/admin";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("upstash-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  try {
    await receiver.verify({ body, signature, url: request.url });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { ownerId } = JSON.parse(body);
  if (!ownerId) {
    return NextResponse.json({ error: "Missing ownerId" }, { status: 400 });
  }

  try {
    // 0. Clean up stale pending uploads (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: staleCount } = await supabaseAdmin
      .from("items")
      .delete({ count: "exact" })
      .eq("owner_id", ownerId)
      .eq("status", "pending")
      .lt("created_at", oneHourAgo);

    if (staleCount && staleCount > 0) {
      console.log(`[sync-worker] Cleaned up ${staleCount} stale pending items`);
    }

    // 1. Collect every key + size currently in the bucket
    const bucketObjects = new Map<string, number>(); // key -> size
    let continuationToken: string | undefined;

    do {
      const res = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        })
      );

      for (const obj of res.Contents ?? []) {
        if (obj.Key) bucketObjects.set(obj.Key, obj.Size ?? 0);
      }

      continuationToken = res.IsTruncated
        ? res.NextContinuationToken
        : undefined;
    } while (continuationToken);

    console.log(`[sync-worker] Bucket has ${bucketObjects.size} keys`);

    // 2. Get all items owned by this user (any status)
    const { data: items, error: fetchError } = await supabaseAdmin
      .from("items")
      .select("id, s3_key, size, status")
      .eq("owner_id", ownerId);

    if (fetchError) throw fetchError;

    const dbKeySet = new Set((items ?? []).map((i) => i.s3_key));

    console.log(`[sync-worker] DB has ${items?.length ?? 0} items for owner ${ownerId}`);

    // 3. DELETE orphans: DB rows whose s3_key doesn't exist in the bucket
    const orphanIds: string[] = [];
    for (const item of items ?? []) {
      // Only delete file items (not folders) whose key is missing
      if (item.size !== null && !bucketObjects.has(item.s3_key)) {
        orphanIds.push(item.id);
      }
    }

    if (orphanIds.length > 0) {
      for (let i = 0; i < orphanIds.length; i += 200) {
        const batch = orphanIds.slice(i, i + 200);
        const { error: delError, count } = await supabaseAdmin
          .from("items")
          .delete({ count: "exact" })
          .in("id", batch);
        console.log(`[sync-worker] Deleted batch of ${count} orphan files`);
        if (delError) throw delError;
      }
    }

    // 4. CREATE missing: bucket keys that have no DB row
    const missingKeys: string[] = [];
    for (const key of bucketObjects.keys()) {
      if (!dbKeySet.has(key)) {
        missingKeys.push(key);
      }
    }

    console.log(`[sync-worker] Found ${missingKeys.length} bucket objects missing from DB`);

    if (missingKeys.length > 0) {
      // Sort so parent folders come before children (shorter paths first)
      missingKeys.sort((a, b) => a.split("/").length - b.split("/").length);

      // Track folder s3_key -> id so we can set parent_id for children
      // Start with existing folders from DB
      const folderIdMap = new Map<string, string>();
      for (const item of items ?? []) {
        if (item.size === null) {
          folderIdMap.set(item.s3_key, item.id);
        }
      }

      for (const key of missingKeys) {
        const isFolder = key.endsWith("/");
        const parts = key.split("/").filter(Boolean);
        const name = parts[parts.length - (isFolder ? 1 : 0)] || key;

        // Find parent: walk up the path to find an existing folder
        let parentId: string | null = null;
        if (parts.length > 1) {
          // Build the parent folder's s3_key
          const parentParts = isFolder ? parts.slice(0, -1) : parts.slice(0, -1);
          const parentKey = parentParts.join("/") + "/";

          // If parent folder doesn't exist in DB yet, create the chain
          if (!folderIdMap.has(parentKey)) {
            // Create ancestor folders as needed
            for (let depth = 1; depth <= parentParts.length; depth++) {
              const ancestorKey = parentParts.slice(0, depth).join("/") + "/";
              if (folderIdMap.has(ancestorKey)) continue;

              const ancestorName = parentParts[depth - 1];
              const ancestorParentKey =
                depth > 1 ? parentParts.slice(0, depth - 1).join("/") + "/" : null;
              const ancestorParentId = ancestorParentKey
                ? folderIdMap.get(ancestorParentKey) ?? null
                : null;

              const { data: newFolder } = await supabaseAdmin
                .from("items")
                .insert({
                  name: ancestorName,
                  s3_key: ancestorKey,
                  parent_id: ancestorParentId,
                  owner_id: ownerId,
                  status: "ready",
                })
                .select("id")
                .single();

              if (newFolder) {
                folderIdMap.set(ancestorKey, newFolder.id);
                console.log(`[sync-worker] Created ancestor folder: ${ancestorKey}`);
              }
            }
          }

          parentId = folderIdMap.get(parentKey) ?? null;
        }

        // Detect mime type from extension for files
        let mimeType: string | null = null;
        let size: number | null = null;
        if (!isFolder) {
          size = bucketObjects.get(key) ?? 0;
          // Try HeadObject for accurate content-type
          try {
            const head = await s3Client.send(
              new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key })
            );
            mimeType = head.ContentType ?? "application/octet-stream";
            size = head.ContentLength ?? size;
          } catch {
            mimeType = guessMimeType(name);
          }
        }

        const { data: newItem } = await supabaseAdmin
          .from("items")
          .insert({
            name,
            s3_key: key,
            parent_id: parentId,
            size,
            mime_type: mimeType,
            owner_id: ownerId,
            status: "ready",
          })
          .select("id")
          .single();

        if (newItem && isFolder) {
          folderIdMap.set(key, newItem.id);
        }
      }
    }

    // 5. Prune empty folders (leaves first, repeat until stable)
    let pruned = 0;
    let changed = true;
    while (changed) {
      changed = false;

      const { data: folders, error: fErr } = await supabaseAdmin
        .from("items")
        .select("id, s3_key")
        .eq("owner_id", ownerId)
        .is("size", null);

      if (fErr) throw fErr;
      if (!folders || folders.length === 0) break;

      const folderIds = folders.map((f) => f.id);

      const { data: hasChildren, error: hcErr } = await supabaseAdmin
        .from("items")
        .select("parent_id")
        .in("parent_id", folderIds);

      if (hcErr) throw hcErr;

      const parentWithKids = new Set(
        (hasChildren ?? []).map((r) => r.parent_id)
      );

      // Only prune folders whose s3_key is also missing from the bucket
      const emptyFolderIds = folderIds.filter(
        (id) => {
          if (parentWithKids.has(id)) return false;
          const folder = folders.find((f) => f.id === id);
          return folder && !bucketObjects.has(folder.s3_key);
        }
      );

      if (emptyFolderIds.length === 0) break;

      for (let i = 0; i < emptyFolderIds.length; i += 200) {
        const batch = emptyFolderIds.slice(i, i + 200);
        const { error: delErr } = await supabaseAdmin
          .from("items")
          .delete()
          .in("id", batch);
        if (delErr) throw delErr;
      }

      pruned += emptyFolderIds.length;
      changed = true;
    }

    return NextResponse.json({
      deleted: orphanIds.length + pruned,
      created: missingKeys.length,
      kept: (items?.length ?? 0) - orphanIds.length - pruned,
      bucketObjectCount: bucketObjects.size,
    });
  } catch (error) {
    console.error("Sync worker error:", error);
    return NextResponse.json({ error: "Sync worker failed" }, { status: 500 });
  }
}

// Simple mime-type guesser as fallback when HeadObject fails
function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", avif: "image/avif",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac",
    pdf: "application/pdf", zip: "application/zip", "7z": "application/x-7z-compressed",
    rar: "application/vnd.rar", tar: "application/x-tar", gz: "application/gzip",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain", html: "text/html", css: "text/css", js: "text/javascript",
    json: "application/json", xml: "application/xml",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}
