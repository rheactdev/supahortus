import { NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { createClient } from "@/lib/supabase/server";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (authData.user.app_metadata?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    await qstash.publishJSON({
      url: `${url.origin}/api/s3/sync-worker`,
      body: { ownerId: authData.user.id },
      retries: 3,
    });

    return NextResponse.json({ queued: true });
  } catch (error) {
    console.error("Sync enqueue error:", error);
    return NextResponse.json({ error: "Failed to queue sync" }, { status: 500 });
  }
}
