import { isEncryptedObject } from "@/lib/storage-encryption";
import { storageTransferUrl } from "@/lib/storage-transfer-url";
import { NextResponse } from "next/server";
import { GetObjectCommand, type GetObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireGardenPermission } from "@/lib/storage-access";
import { processorFileType } from "@/lib/thumbnail-types";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = authData.claims.sub as string;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const preview = searchParams.get("asset") === "preview";
  const download = !preview && searchParams.get("download") === "true";

  if (!id) {
    return NextResponse.json(
      { error: "id query parameter is required" },
      { status: 400 }
    );
  }

  try {
    const { data: item, error: fetchError } = await supabaseAdmin
      .from("items")
      .select("garden_id, s3_key, thumbnail_key, name, mime_type")
      .eq("type", "file")
      .eq("status", "ready")
      .eq("id", id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    try {
      await requireGardenPermission(item.garden_id, userId, "read");
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const key = preview
      ? (processorFileType(item.name) ? item.thumbnail_key : null)
      : item.s3_key;
    if (!key) {
      return NextResponse.json({ unavailable: true }, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }

    if (isEncryptedObject(key)) {
      const url = storageTransferUrl(id, preview ? "preview" : "original", { download });
      if (searchParams.get("action") === "download") {
        return NextResponse.redirect(new URL(url, request.url));
      }
      return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
    }

    const commandConfig: GetObjectCommandInput = {
      Bucket: BUCKET_NAME,
      Key: key,
      ResponseContentType: preview ? "image/webp" : item.mime_type || "application/octet-stream",
    };

    if (download) {
      commandConfig.ResponseContentDisposition = contentDisposition(
        "attachment",
        preview ? item.name.replace(/\.[^.]+$/, ".webp") : item.name,
      );
    } else {
      commandConfig.ResponseContentDisposition = contentDisposition(
        "inline",
        item.name,
      );
    }

    const command = new GetObjectCommand(commandConfig);
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    if (searchParams.get("action") === "download") {
      return NextResponse.redirect(url);
    }

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Download presign error:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}

function contentDisposition(disposition: "inline" | "attachment", name: string) {
  const asciiName = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
