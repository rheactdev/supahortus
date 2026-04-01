import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

    const { data: item, error: fetchError } = await supabaseAdmin
      .from("items")
      .select("owner_id, status")
      .eq("id", itemId)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (item.owner_id !== userId) {
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

    return NextResponse.json({ confirmed: true });
  } catch (error) {
    console.error("Confirm error:", error);
    return NextResponse.json({ error: "Failed to confirm upload" }, { status: 500 });
  }
}
