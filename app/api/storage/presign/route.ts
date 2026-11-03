import { encryptionInput, newUploadKey, signObject } from "@/lib/storage-encryption";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildS3Key } from "@/lib/data";
import { requireGardenPermission } from "@/lib/storage-access";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authData.claims.sub as string;

  try {
    const { filename, contentType, parentId, gardenId } = await request.json();

    if (typeof filename !== "string" || !filename || /[/\\]/.test(filename) || !gardenId) {
      return NextResponse.json(
        { error: "filename and gardenId are required" },
        { status: 400 }
      );
    }

    try {
      await requireGardenPermission(gardenId, userId, "upload");
    } catch {
      return NextResponse.json({ error: "No upload permission" }, { status: 403 });
    }

    const s3Key = newUploadKey(await buildS3Key(gardenId, parentId || null, filename));

    const uploadContentType = typeof contentType === "string" && contentType
      ? contentType : "application/octet-stream";
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ...encryptionInput(s3Key),
      ContentType: uploadContentType,
    });
    const { url, headers } = await signObject(command);

    // Insert pending item record
    const { data: item, error: insertError } = await supabaseAdmin
      .from("items")
      .insert({
        name: filename,
        s3_key: s3Key,
        parent_id: parentId || null,
        garden_id: gardenId,
        type: "file",
        mime_type: uploadContentType,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      method: "PUT",
      url,
      headers: { ...headers, "Content-Type": uploadContentType },
      itemId: item.id,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Storage upload signing failed");
    return NextResponse.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 }
    );
  }
}
