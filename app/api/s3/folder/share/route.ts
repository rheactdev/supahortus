import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

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
    const folderPrefix = request.nextUrl.searchParams.get("folderPrefix");

    if (!folderPrefix) {
      return NextResponse.json({ error: "folderPrefix is required" }, { status: 400 });
    }

    const { data: shares, error } = await supabase
      .from("folder_shares")
      .select("user_email, created_at")
      .eq("folder_prefix", folderPrefix)
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
    const { folderPrefix, email } = await request.json();
    const { origin } = request.nextUrl;

    if (!folderPrefix || !email) {
      return NextResponse.json({ error: "folderPrefix and email are required" }, { status: 400 });
    }

    // Insert first: Since you already catch the "23505" unique constraint error below, 
    // doing a separate `.single()` check above it is redundant and prone to PGRST116 (No rows found) errors.
    const { error: insertError } = await supabase.from("folder_shares").insert({
      folder_prefix: folderPrefix,
      user_email: email,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "This folder is already shared with that user" }, { status: 409 });
      }
      throw insertError;
    }

    // Initialize the Admin Client to bypass PKCE requirements
    // Ensure SUPABASE_SERVICE_ROLE_KEY is in your .env.local
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY!
    );

    // Send a true invite so the user doesn't hit a PKCE verification error
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      // Point them to the callback route we built!
      redirectTo: `${origin}/api/auth/callback?next=/dashboard`,
    });

    if (inviteError) {
      console.error("Invite error:", inviteError);
      // Optional: If you strictly require the email to send, you could delete 
      // the folder_share record here to roll back the transaction.
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
    const folderPrefix = request.nextUrl.searchParams.get("folderPrefix");
    const email = request.nextUrl.searchParams.get("email");

    if (!folderPrefix || !email) {
      return NextResponse.json({ error: "folderPrefix and email are required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("folder_shares")
      .delete()
      .eq("folder_prefix", folderPrefix)
      .eq("user_email", email);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unshare folder error:", err);
    return NextResponse.json({ error: "Failed to remove share" }, { status: 500 });
  }
}