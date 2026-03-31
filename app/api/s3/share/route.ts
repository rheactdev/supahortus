import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { key } = await request.json();
    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    const shortCode = crypto.randomUUID().substring(0, 8);
    
    const { error } = await supabase.from('shares').insert({
      short_code: shortCode,
      file_key: key,
      user_id: authData.user.id
    });

    if (error) throw error;

    const url = new URL(request.url);
    return NextResponse.json({ url: `${url.origin}/s/${shortCode}` });

  } catch(err) {
    console.error("Failed to create share:", err);
    return NextResponse.json({ error: "Failed to create share" }, { status: 500 });
  }
}
