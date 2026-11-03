import { isEncryptedObject, requireUploadedObject } from "@/lib/storage-encryption";
import { NextResponse } from "next/server";
import { CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";
import { requireMultipartUpload } from "../access";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authData.claims.sub as string;

  try {
    const { uploadId, key, parts, itemId, uploadToken } = await request.json();

    if (!uploadId || !key || !parts || (!uploadToken && !itemId)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { legacyItemId } = await requireMultipartUpload(uploadToken, itemId, key, uploadId, userId);

    try {
      await s3Client.send(
        new CompleteMultipartUploadCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts.map((p: { PartNumber: number; ETag: string }) => ({
              PartNumber: p.PartNumber,
              ETag: p.ETag,
            })),
          },
        })
      );
    } catch (error) {
      if (legacyItemId && !isEncryptedObject(key)) throw error;
      // The completion response may have been lost after B2 committed the object.
      await requireUploadedObject(key);
    }

    return NextResponse.json({ completed: true });
  } catch {
    console.error("Multipart completion failed");
    return NextResponse.json(
      { error: "Failed to complete multipart upload" },
      { status: 500 }
    );
  }
}
