import { NextResponse } from "next/server";
import { CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { uploadId, key, parts } = await request.json();

    if (!uploadId || !key || !parts) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

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

    return NextResponse.json({ completed: true });
  } catch (error) {
    console.error("Complete multipart error:", error);
    return NextResponse.json({ error: "Failed to complete multipart upload" }, { status: 500 });
  }
}
