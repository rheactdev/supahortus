import { NextResponse } from "next/server";
import { UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";
import { requirePendingUpload } from "@/lib/storage-access";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authData.claims.sub as string;

  const { searchParams } = new URL(request.url);
  const uploadId = searchParams.get("uploadId");
  const key = searchParams.get("key");
  const partNumber = searchParams.get("partNumber");
  const itemId = searchParams.get("itemId");

  if (!uploadId || !key || !partNumber || !itemId) {
    return NextResponse.json(
      { error: "Missing required parameters" },
      { status: 400 }
    );
  }

  try {
    await requirePendingUpload(itemId, key, userId);

    const command = new UploadPartCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      UploadId: uploadId,
      PartNumber: Number(partNumber),
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Sign part error:", error);
    return NextResponse.json(
      { error: "Failed to sign part" },
      { status: 500 }
    );
  }
}
