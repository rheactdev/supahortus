import { NextResponse } from "next/server";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authData.claims.sub as string;

  try {
    const { filename, contentType, parentId, size } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: "Filename is required" }, { status: 400 });
    }

    // Build s3_key from parent chain
    let s3Key = filename;
    if (parentId) {
      const { data: parent, error: parentError } = await supabaseAdmin
        .from("items")
        .select("s3_key")
        .eq("id", parentId)
        .single();

      if (parentError || !parent) {
        return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
      }
      s3Key = `${parent.s3_key}${filename}`;
    }

    // Insert pending item record
    const { data: item, error: insertError } = await supabaseAdmin
      .from("items")
      .insert({
        name: filename,
        s3_key: s3Key,
        parent_id: parentId || null,
        size: size || 0,
        mime_type: contentType || "application/octet-stream",
        owner_id: userId,
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    // Create S3 multipart upload
    const result = await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        ContentType: contentType || "application/octet-stream",
      })
    );

    return NextResponse.json({
      uploadId: result.UploadId,
      key: s3Key,
      itemId: item.id,
    });
  } catch (error) {
    console.error("Multipart create error:", error);
    return NextResponse.json({ error: "Failed to create multipart upload" }, { status: 500 });
  }
}
