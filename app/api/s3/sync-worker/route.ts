import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
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

    // 1. Collect every key currently in the bucket
    const bucketKeys = new Set<string>();
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
        if (obj.Key) bucketKeys.add(obj.Key);
      }

      continuationToken = res.IsTruncated
        ? res.NextContinuationToken
        : undefined;
    } while (continuationToken);

    console.log(`[sync-worker] Bucket has ${bucketKeys.size} keys`);

    // 2. Get all ready items owned by this user
    const { data: items, error: fetchError } = await supabaseAdmin
      .from("items")
      .select("id, s3_key, size")
      .eq("owner_id", ownerId)
      .eq("status", "ready");

    if (fetchError) throw fetchError;

    console.log(`[sync-worker] DB has ${items?.length ?? 0} items for owner ${ownerId}`);

    if (!items || items.length === 0) {
      return NextResponse.json({ deleted: 0, kept: 0 });
    }

    // 3. Delete file items whose s3_key is missing from the bucket
    const orphanFileIds: string[] = [];
    for (const item of items) {
      if (item.size !== null && !bucketKeys.has(item.s3_key)) {
        orphanFileIds.push(item.id);
      }
    }

    console.log(`[sync-worker] Found ${orphanFileIds.length} orphan files out of ${items.filter(i => i.size !== null).length} total files`);

    if (orphanFileIds.length > 0) {
      for (let i = 0; i < orphanFileIds.length; i += 200) {
        const batch = orphanFileIds.slice(i, i + 200);
        const { error: delError, count } = await supabaseAdmin
          .from("items")
          .delete({ count: "exact" })
          .in("id", batch);
        console.log(`[sync-worker] Deleted batch of ${count} orphan files`);
        if (delError) throw delError;
      }
    }

    // 4. Prune empty folders (leaves first, repeat until stable)
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

      const emptyFolderIds = folderIds.filter(
        (id) => !parentWithKids.has(id)
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
      deleted: orphanFileIds.length + pruned,
      kept: items.length - orphanFileIds.length - pruned,
      bucketObjects: bucketKeys.size,
    });
  } catch (error) {
    console.error("Sync worker error:", error);
    return NextResponse.json({ error: "Sync worker failed" }, { status: 500 });
  }
}
