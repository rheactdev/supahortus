import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import {
  isOfficeFile,
  queueOfficePreview,
} from "@/lib/office-preview";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { requireGardenPermission } from "@/lib/storage-access";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;

  if (typeof userId !== "string") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const itemId = new URL(request.url).searchParams.get("id");
  if (!itemId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { data: item } = await supabaseAdmin
    .from("items")
    .select(
      "id, garden_id, name, s3_key, status, preview_key, preview_status, preview_error",
    )
    .eq("id", itemId)
    .eq("type", "file")
    .maybeSingle();

  if (!item || item.status !== "ready" || !isOfficeFile(item.name)) {
    return NextResponse.json({ error: "Office file not found" }, { status: 404 });
  }

  try {
    await requireGardenPermission(item.garden_id, userId, "read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (item.preview_status === "ready" && item.preview_key) {
    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: item.preview_key,
        ResponseContentType: "application/pdf",
        ResponseContentDisposition: `inline; filename="${safePdfName(item.name)}"`,
      }),
      { expiresIn: 3600 },
    );
    return NextResponse.json({ status: "ready", url });
  }

  if (item.preview_status !== "pending") {
    await queueOfficePreview(item);
  }

  return NextResponse.json(
    {
      status: item.preview_status === "failed" ? "retrying" : "pending",
      error: item.preview_error,
    },
    { status: 202 },
  );
}

function safePdfName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/["\\\r\n]/g, "_");
  return `${base || "document"}.pdf`;
}
