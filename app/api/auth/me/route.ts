import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = authData.user;
  const isAdmin = user.app_metadata?.role === "admin";

  return NextResponse.json({
    email: user.email,
    isAdmin,
  });
}
