import { NextResponse } from "next/server";
import { CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Client } from "@upstash/qstash";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";

const qstash = new Client({ baseUrl: process.env.QSTASH_URL!, token: process.env.QSTASH_TOKEN! });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { itemId, newName } = await request.json();

    if (!itemId || !newName || typeof newName !== "string") {
      return NextResponse.json({ error: "itemId and newName are required" }, { status: 400 });
    }

    if (newName.includes("/")) {
      return NextResponse.json({ error: "Name cannot contain slashes" }, { status: 400 });
    }

    // Fetch the item (RLS enforces ownership)
    const { data: item, error: fetchError } = await supabase
      .from("items")
      .select("id, name, s3_key, size, parent_id")
      .eq("id", itemId)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const isFolder = item.size === null;
    const oldS3Key = item.s3_key;

    // Compute new s3_key
    let newS3Key: string;
    if (item.parent_id) {
      const { data: parent } = await supabase
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

    // Update the item's name and s3_key in DB (instant)
    const { error: updateError } = await supabase
      .from("items")
      .update({ name: newName, s3_key: newS3Key })
      .eq("id", itemId);

    if (updateError) throw updateError;

    if (isFolder) {
      // Enqueue QStash job to reconcile all descendant s3_keys in the background
      const url = new URL(request.url);
      await qstash.publishJSON({
        url: `${url.origin}/api/s3/rename-worker`,
        body: {
          folderId: itemId,
          oldPrefix: oldS3Key,
          newPrefix: newS3Key,
        },
        retries: 3,
      });
    } else {
      // Single file: copy + delete in S3 immediately
      const encodedOldKey = oldS3Key.split('/').map(encodeURIComponent).join('/');
      await s3Client.send(new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: `${BUCKET_NAME}/${encodedOldKey}`,
        Key: newS3Key,
      }));
      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: oldS3Key,
      }));
    }

    return NextResponse.json({ success: true, newS3Key });
  } catch (error) {
    console.error("Rename error:", error);
    return NextResponse.json({ error: "Failed to rename item" }, { status: 500 });
  }
}
