import { NextResponse } from "next/server";
import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { auth } from "@/lib/auth";
import db from "@/db";
import { headers } from "next/headers";

export async function DELETE(request: Request) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { uploadId, key, itemId } = await request.json();

    if (!uploadId || !key) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Abort S3 multipart upload
    await s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
      })
    );

    // Clean up the pending DB row
    if (itemId) {
      const delStmt = db.prepare(`DELETE FROM items WHERE id = ? AND status = 'pending'`);
      delStmt.run(itemId);
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
