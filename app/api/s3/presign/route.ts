import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { filename, contentType, parentId, size } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: "Filename is required" }, { status: 400 });
    }

    // Build s3_key from parent chain
    let s3Key = filename;
    if (parentId) {
      const { data: parent, error: parentError } = await supabase
        .from("items")
        .select("s3_key")
        .eq("id", parentId)
        .single();

      if (parentError || !parent) {
        return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
      }
      s3Key = `${parent.s3_key}${filename}`;
    }

    // Insert item record into DB
    const { data: item, error: insertError } = await supabase
      .from("items")
      .insert({
        name: filename,
        s3_key: s3Key,
        parent_id: parentId || null,
        size: size || 0,
        mime_type: contentType || "application/octet-stream",
        owner_id: authData.user.id,
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
    return NextResponse.json({ error: "Failed to generate presigned URL" }, { status: 500 });
  }
}
