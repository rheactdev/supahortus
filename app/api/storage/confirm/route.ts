import { requireUploadedObject } from "@/lib/storage-encryption";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireGardenPermission } from "@/lib/storage-access";
import { buildS3Key } from "@/lib/data";
import { readUploadTicket } from "@/lib/upload-ticket";
import { queueThumbnail, type ThumbnailPayload } from "@/lib/thumbnail-workflow";

async function tryQueueThumbnail(payload: ThumbnailPayload, name: string, thumbnailKey: string | null) {
  try {
    return await queueThumbnail(payload, name, thumbnailKey);
  } catch {
    console.error("[thumbnail] Could not queue thumbnail generation");
    return false;
  }
}

async function confirmUpload(uploadToken: unknown, userId: string) {
  const ticket = readUploadTicket(uploadToken, userId);
  if (!ticket) {
    return NextResponse.json({ error: "Invalid or expired upload token" }, { status: 400 });
  }

  try {
    await requireGardenPermission(ticket.gardenId, userId, "upload");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const destination = await buildS3Key(ticket.gardenId, ticket.parentId, ticket.filename);
  if (destination.slice(0, destination.lastIndexOf("/") + 1) !== ticket.key.slice(0, ticket.key.lastIndexOf("/") + 1)) {
    return NextResponse.json({ error: "The upload destination has moved" }, { status: 409 });
  }

  await requireUploadedObject(ticket.key);

  const { error } = await supabaseAdmin.from("items").insert({
    id: ticket.itemId,
    garden_id: ticket.gardenId,
    parent_id: ticket.parentId,
    name: ticket.filename,
    mime_type: ticket.contentType,
    s3_key: ticket.key,
    status: "ready",
    type: "file",
  });

  let thumbnailKey: string | null = null;
  if (error?.code === "23505") {
    const { data: existing, error: readError } = await supabaseAdmin
      .from("items")
      .select("thumbnail_key")
      .eq("id", ticket.itemId)
      .eq("garden_id", ticket.gardenId)
      .eq("s3_key", ticket.key)
      .eq("status", "ready")
      .eq("type", "file")
      .maybeSingle();

    if (readError) throw readError;
    if (!existing) {
      return NextResponse.json({ error: "This upload conflicts with an existing file" }, { status: 409 });
    }
    thumbnailKey = existing.thumbnail_key;
  } else if (error) {
    throw error;
  }

  revalidateTag(`garden-${ticket.gardenId}`, { expire: 0 });
  await tryQueueThumbnail({ gardenId: ticket.gardenId, itemId: ticket.itemId }, ticket.filename, thumbnailKey);
  return NextResponse.json({ confirmed: true });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authData.claims.sub as string;

  try {
    const { itemId, uploadToken, generateThumbnail } = await request.json();

    if (uploadToken !== undefined) {
      return await confirmUpload(uploadToken, userId);
    }

    if (typeof itemId !== "string" || !itemId) {
      return NextResponse.json({ error: "An upload token or itemId is required" }, { status: 400 });
    }

    // Fetch item and verify membership
    const { data: item, error: fetchError } = await supabaseAdmin
      .from("items")
      .select("garden_id, status, s3_key, name, thumbnail_key")
      .eq("id", itemId)
      .eq("type", "file")
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    try {
      await requireGardenPermission(item.garden_id, userId, "upload");
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (generateThumbnail === true && item.status !== "ready") {
      return NextResponse.json({ error: "File is not ready" }, { status: 409 });
    }

    if (item.status !== "ready") {
      await requireUploadedObject(item.s3_key);
      const { error: updateError } = await supabaseAdmin
        .from("items")
        .update({ status: "ready" })
        .eq("id", itemId);

      if (updateError) throw updateError;
    }

    const payload = { gardenId: item.garden_id, itemId };
    if (generateThumbnail === true) {
      const queued = await queueThumbnail(payload, item.name, item.thumbnail_key);
      return NextResponse.json({ queued });
    }

    revalidateTag(`garden-${item.garden_id}`, { expire: 0 });
    await tryQueueThumbnail(payload, item.name, item.thumbnail_key);
    return NextResponse.json({ confirmed: true });
  } catch {
    console.error("Upload confirmation failed");
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 }
    );
  }
}
