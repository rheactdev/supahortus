import { NextResponse } from "next/server";
import { Client } from "@upstash/qstash";
import { createClient } from "@/lib/supabase/server";

const qstash = new Client({ token: process.env.QSTASH_TOKEN! });

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const claims = authData.claims as Record<string, unknown>;
  const appMeta = claims.app_metadata as Record<string, unknown> | undefined;
  if (appMeta?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    await qstash.publishJSON({
      url: `${url.origin}/api/s3/sync-worker`,
      body: { ownerId: claims.sub as string },
      retries: 3,
    });

    return NextResponse.json({ queued: true });
  } catch (error) {
    console.error("Sync enqueue error:", error);
    return NextResponse.json({ error: "Failed to queue sync" }, { status: 500 });
  }
}
