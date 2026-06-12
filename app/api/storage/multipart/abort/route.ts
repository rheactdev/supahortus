import { NextResponse } from "next/server";
import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requirePendingUpload } from "@/lib/storage-access";

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authData.claims.sub as string;

  try {
    const { uploadId, key, itemId } = await request.json();

    if (!uploadId || !key || !itemId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    await requirePendingUpload(itemId, key, userId);

    // Abort S3 multipart upload
    await s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
      })
    );

    // Clean up the pending DB row
    await supabaseAdmin
      .from("items")
      .delete()
      .eq("id", itemId)
      .eq("status", "pending");

    return NextResponse.json({ aborted: true });
  } catch (error) {
    console.error("Abort multipart error:", error);
    return NextResponse.json(
      { error: "Failed to abort multipart upload" },
      { status: 500 }
    );
  }
}
