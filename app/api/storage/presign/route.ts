import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
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

    if (!filename || !gardenId) {
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

    const s3Key = await buildS3Key(gardenId, parentId || null, filename);

    // Insert pending item record
    const { data: item, error: insertError } = await supabaseAdmin
      .from("items")
      .insert({
        name: filename,
        s3_key: s3Key,
        parent_id: parentId || null,
        garden_id: gardenId,
        type: "file",
        mime_type: contentType || "application/octet-stream",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return NextResponse.json({
      method: "PUT",
      url,
      headers: { "Content-Type": contentType },
      itemId: item.id,
    });
  } catch (error) {
    console.error("Presign error:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 }
    );
  }
}
