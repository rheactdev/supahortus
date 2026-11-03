import { encryptionInput, newUploadKey } from "@/lib/storage-encryption";
import { NextResponse } from "next/server";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";
import { buildS3Key } from "@/lib/data";
import { requireGardenPermission } from "@/lib/storage-access";
import { issueUploadTicket } from "@/lib/upload-ticket";

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

    const destinationParentId = parentId || null;
    const key = newUploadKey(await buildS3Key(gardenId, destinationParentId, filename));
    const uploadContentType = typeof contentType === "string" && contentType
      ? contentType : "application/octet-stream";

    // Create S3 multipart upload
    const { UploadId: uploadId } = await s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ...encryptionInput(key),
        ContentType: uploadContentType,
      })
    );

    if (!uploadId) throw new Error("B2 did not return an upload ID");

    const uploadToken = issueUploadTicket({
      userId,
      gardenId,
      parentId: destinationParentId,
      filename,
      contentType: uploadContentType,
      key,
      uploadId,
    });

    return NextResponse.json({ uploadId, key, uploadToken }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("Multipart initialization failed");
    return NextResponse.json(
      { error: "Failed to create multipart upload" },
      { status: 500 }
    );
  }
}
