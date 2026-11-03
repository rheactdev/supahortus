import { requireUploadedEncryptedObject } from "@/lib/storage-encryption";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireGardenPermission } from "@/lib/storage-access";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authData.claims.sub as string;

  try {
    const { itemId } = await request.json();

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    // Fetch item and verify membership
    const { data: item, error: fetchError } = await supabaseAdmin
      .from("items")
      .select("garden_id, status, s3_key")
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

    if (item.status !== "ready") {
      await requireUploadedEncryptedObject(item.s3_key);
      const { error: updateError } = await supabaseAdmin
        .from("items")
        .update({ status: "ready" })
        .eq("id", itemId);

      if (updateError) throw updateError;
    }

    revalidateTag(`garden-${item.garden_id}`, { expire: 0 });
    return NextResponse.json({ confirmed: true });
  } catch {
    console.error("Upload confirmation failed");
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 }
    );
  }
}
