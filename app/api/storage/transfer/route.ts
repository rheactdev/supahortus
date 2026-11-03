import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { getSharedFile } from "@/lib/item-share";
import { BUCKET_NAME } from "@/lib/s3";
import { requireGardenPermission } from "@/lib/storage-access";
import { encryptionInput, isEncryptedObject, signObject } from "@/lib/storage-encryption";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCardThumbnailKey, processorFileType } from "@/lib/thumbnail-types";

const noStore = { "Cache-Control": "private, no-store" };

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

export async function GET(request: Request) {
  if (request.headers.get("x-hortus-transfer") !== "descriptor") {
    return new Response("Encrypted transfers require the Hortus browser worker. Open the file from Hortus and try again.", {
      status: 503,
      headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  const asset = params.get("asset");
  const share = params.get("share");
  const download = params.get("download") === "true";
  if (!id || (asset !== "original" && asset !== "thumbnail" && asset !== "preview")) {
    return error("Invalid storage request", 400);
  }

  try {
    const item = share ? await getSharedFile(share, id) : await getAuthorizedItem(id);
    if (!item) return error("File unavailable", 404);

    const key = asset === "thumbnail"
      ? getCardThumbnailKey(item)
      : asset === "preview"
        ? (processorFileType(item.name) ? item.thumbnail_key : null)
        : item.s3_key;
    if (!key || !isEncryptedObject(key)) return error("Encrypted object unavailable", 404);

    const isDerivative = key !== item.s3_key;
    const name = isDerivative ? `${item.name.replace(/\.[^.]+$/, "")}.webp` : item.name;
    const filename = encodeURIComponent(name).replace(/['()*]/g, (character) =>
      "%" + character.charCodeAt(0).toString(16).toUpperCase(),
    );
    const descriptor = await signObject(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ...encryptionInput(key),
    }));
    return NextResponse.json({
      ...descriptor,
      disposition: `${download ? "attachment" : "inline"}; filename*=UTF-8''${filename}`,
      contentType: isDerivative ? "image/webp" : item.mime_type || "application/octet-stream",
    }, { headers: noStore });
  } catch {
    return error("Encrypted transfer could not be prepared", 503);
  }
}

async function getAuthorizedItem(id: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (typeof userId !== "string") return null;

  const { data: item } = await supabaseAdmin.from("items")
    .select("garden_id, name, s3_key, card_thumbnail_key, thumbnail_key, mime_type")
    .eq("id", id).eq("type", "file").eq("status", "ready").maybeSingle();
  if (!item) return null;
  try {
    await requireGardenPermission(item.garden_id, userId, "read");
  } catch {
    return null;
  }
  return item;
}
