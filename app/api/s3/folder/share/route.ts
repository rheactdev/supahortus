import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (authData.user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const itemId = request.nextUrl.searchParams.get("itemId");

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    const { data: shares, error } = await supabase
      .from("folder_shares")
      .select("user_email, created_at")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ shares });
  } catch (err) {
    console.error("List shares error:", err);
    return NextResponse.json({ error: "Failed to list shares" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (authData.user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { itemId, email } = await request.json();
    const { origin } = request.nextUrl;

    if (!itemId || !email) {
      return NextResponse.json({ error: "itemId and email are required" }, { status: 400 });
    }

    const { error: insertError } = await supabase.from("folder_shares").insert({
      item_id: itemId,
      user_email: email,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "This folder is already shared with that user" }, { status: 409 });
      }
      throw insertError;
    }

    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/api/auth/callback?next=/dashboard`,
    });

    if (inviteError) {
      console.error("Invite error:", inviteError);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Share folder error:", err);
    return NextResponse.json({ error: "Failed to share folder" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (authData.user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const itemId = request.nextUrl.searchParams.get("itemId");
    const email = request.nextUrl.searchParams.get("email");

    if (!itemId || !email) {
      return NextResponse.json({ error: "itemId and email are required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("folder_shares")
      .delete()
      .eq("item_id", itemId)
      .eq("user_email", email);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unshare folder error:", err);
    return NextResponse.json({ error: "Failed to remove share" }, { status: 500 });
  }
}