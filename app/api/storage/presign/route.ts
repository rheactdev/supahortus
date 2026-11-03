import { encryptionInput, newUploadKey, signObject } from "@/lib/storage-encryption";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET_NAME } from "@/lib/s3";
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
  let stage = "read upload request";

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

    stage = "resolve upload destination";
    const destination = await buildS3Key(gardenId, parentId || null, filename);

    stage = "prepare storage encryption";
    const s3Key = newUploadKey(destination);
    const uploadContentType = typeof contentType === "string" && contentType
      ? contentType : "application/octet-stream";
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ...encryptionInput(s3Key),
      ContentType: uploadContentType,
    });
    stage = "sign storage request";
    const { url, headers } = await signObject(command);

    return NextResponse.json({
      method: "PUT",
      url,
      headers: { ...headers, "Content-Type": uploadContentType },
      uploadToken: issueUploadTicket({
        userId, gardenId, parentId: parentId || null, filename, contentType: uploadContentType, key: s3Key,
      }),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // SDK errors can contain signed request details, so log only the stage and database code.
    const databaseError = stage === "resolve upload destination" && error instanceof Error
      ? error.cause
      : undefined;
    const code = databaseError && typeof databaseError === "object" && "code" in databaseError
      && typeof databaseError.code === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(databaseError.code)
      ? databaseError.code
      : undefined;
    console.error("Storage upload signing failed", { stage, code });
    return NextResponse.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 }
    );
  }
}
