import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Client } from "@upstash/qstash";

const qstash = new Client({ token: process.env.QSTASH_TOKEN || "" });

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
      .select("garden_id, status, name, s3_key")
      .eq("id", itemId)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Verify user is a member with upload permission
    const { data: membership } = await supabaseAdmin
      .from("garden_members")
      .select("can_upload")
      .eq("garden_id", item.garden_id)
      .eq("user_id", userId)
      .single();

    if (!membership?.can_upload) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (item.status === "ready") {
      return NextResponse.json({ confirmed: true });
    }

    const { error: updateError } = await supabaseAdmin
      .from("items")
      .update({ status: "ready" })
      .eq("id", itemId);

    if (updateError) throw updateError;

    // Check if we need to generate a thumbnail
    if (/\.(psd|afdesign|afphoto|afpub|af)$/i.test(item.name)) {
      const baseUrl = process.env.UPSTASH_WORKFLOW_URL || 
        (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"));
      await qstash.publishJSON({
        url: `${baseUrl}/api/workflow/thumbnail`,
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
