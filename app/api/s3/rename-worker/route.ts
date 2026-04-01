import { NextResponse } from "next/server";
import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Receiver } from "@upstash/qstash";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BATCH_SIZE = 200;

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request) {
  // Verify QStash signature
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

  const { folderId, oldPrefix, newPrefix } = JSON.parse(body);

  if (!folderId || !oldPrefix || !newPrefix) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    // Find items whose s3_key still starts with the old prefix (stale keys)
    const { data: staleItems, error } = await supabaseAdmin
      .from("items")
      .select("id, s3_key")
      .like("s3_key", `${oldPrefix}%`)
      .limit(BATCH_SIZE);

    if (error) throw error;

    if (!staleItems || staleItems.length === 0) {
      // All done — also rename the folder object itself in S3
      const encodedOld = oldPrefix.split('/').map(encodeURIComponent).join('/');
      await s3Client.send(new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: `${BUCKET_NAME}/${encodedOld}`,
        Key: newPrefix,
      }));
      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: oldPrefix,
      }));
      return NextResponse.json({ done: true, moved: 0 });
    }

    // Process batch: copy to new key, then delete old key + update DB in parallel
    await Promise.all(staleItems.map(async (item) => {
      const newKey = item.s3_key.replace(oldPrefix, newPrefix);
      const encodedKey = item.s3_key.split('/').map(encodeURIComponent).join('/');

      // Copy must complete before we delete the old key
      await s3Client.send(new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: `${BUCKET_NAME}/${encodedKey}`,
        Key: newKey,
      }));

      // Delete old S3 key + update DB row in parallel
      await Promise.all([
        s3Client.send(new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: item.s3_key,
        })),
        supabaseAdmin
          .from("items")
          .update({ s3_key: newKey })
          .eq("id", item.id),
      ]);
    }));

    // If there might be more, re-enqueue
    if (staleItems.length === BATCH_SIZE) {
      const { Client } = await import("@upstash/qstash");
      const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

      await qstash.publishJSON({
        url: request.url,
        body: { folderId, oldPrefix, newPrefix },
        retries: 3,
        delay: 1,
      });
    }

    return NextResponse.json({ done: false, moved: staleItems.length });
  } catch (error) {
    console.error("Rename worker error:", error);
    return NextResponse.json({ error: "Worker failed" }, { status: 500 });
  }
}
