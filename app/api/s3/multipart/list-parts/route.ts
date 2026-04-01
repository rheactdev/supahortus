import { NextResponse } from "next/server";
import { ListPartsCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const uploadId = searchParams.get("uploadId");
  const key = searchParams.get("key");

  if (!uploadId || !key) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const result = await s3Client.send(
      new ListPartsCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
      })
    );

    const parts = (result.Parts ?? []).map((p) => ({
      PartNumber: p.PartNumber,
      Size: p.Size,
      ETag: p.ETag,
    }));

    return NextResponse.json(parts);
  } catch (error) {
    console.error("List parts error:", error);
    return NextResponse.json({ error: "Failed to list parts" }, { status: 500 });
  }
}
