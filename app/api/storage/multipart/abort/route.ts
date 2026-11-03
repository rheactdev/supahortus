import { NextResponse } from "next/server";
import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireMultipartUpload } from "../access";

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authData.claims.sub as string;

  try {
    const { uploadId, key, itemId, uploadToken } = await request.json();

    if (!uploadId || !key || (!uploadToken && !itemId)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { legacyItemId } = await requireMultipartUpload(uploadToken, itemId, key, uploadId, userId);

    // Abort S3 multipart upload
    await s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
      })
    );

    if (legacyItemId) {
      await supabaseAdmin
        .from("items")
        .delete()
        .eq("id", legacyItemId)
        .eq("status", "pending");
    }

    return NextResponse.json({ aborted: true });
  } catch (error) {
    console.error("Abort multipart error:", error);
    return NextResponse.json(
      { error: "Failed to abort multipart upload" },
      { status: 500 }
    );
  }
}
