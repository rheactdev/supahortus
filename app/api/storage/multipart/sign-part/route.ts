import { encryptionInput, signObject } from "@/lib/storage-encryption";
import { NextResponse } from "next/server";
import { UploadPartCommand } from "@aws-sdk/client-s3";
import { BUCKET_NAME } from "@/lib/s3";
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
      ...encryptionInput(key),
      UploadId: uploadId,
      PartNumber: Number(partNumber),
    });

    return NextResponse.json(await signObject(command), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("Multipart signing failed");
    return NextResponse.json(
      { error: "Failed to sign part" },
      { status: 500 }
    );
  }
}
