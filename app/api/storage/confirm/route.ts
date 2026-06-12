import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Client } from "@upstash/qstash";
import { requireGardenPermission } from "@/lib/storage-access";
import { getAppBaseUrl } from "@/lib/app-url";

const qstash = new Client({ token: process.env.QSTASH_TOKEN || "" });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = authData.claims.sub as string;

  try {
    const { itemId, forceThumbnail } = await request.json();

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    // Fetch item and verify membership
    const { data: item, error: fetchError } = await supabaseAdmin
      .from("items")
      .select("garden_id, status, name, s3_key")
      .eq("id", itemId)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    try {
      await requireGardenPermission(item.garden_id, userId, "upload");
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (item.status === "ready" && !forceThumbnail) {
      return NextResponse.json({ confirmed: true });
    }

    if (item.status !== "ready") {
      const { error: updateError } = await supabaseAdmin
        .from("items")
        .update({ status: "ready" })
        .eq("id", itemId);

      if (updateError) throw updateError;
    }

    // Check if we need to generate a thumbnail
    if (/\.(psd|afdesign|afphoto|afpub|af)$/i.test(item.name)) {
      await qstash.publishJSON({
        url: `${getAppBaseUrl()}/api/workflow/thumbnail`,
        headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? {
          "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        } : undefined,
        body: {
          gardenId: item.garden_id,
          itemId: itemId,
          s3Key: item.s3_key,
          filename: item.name,
        },
      });
    }

    return NextResponse.json({ confirmed: true });
  } catch (error) {
    console.error("Confirm error:", error);
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 }
    );
  }
}
