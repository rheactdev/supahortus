import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";

const MAX_PREVIEW_BYTES = 1024 * 1024;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "id query parameter is required" },
      { status: 400 },
    );
  }

  try {
    // RLS limits this lookup to files visible to the current user.
    const { data: item, error } = await supabase
      .from("items")
      .select("s3_key")
      .eq("id", id)
      .eq("type", "file")
      .eq("status", "ready")
      .single();

    if (error || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const object = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: item.s3_key,
        Range: `bytes=0-${MAX_PREVIEW_BYTES - 1}`,
      }),
    );

    if (!object.Body) {
      throw new Error("Object body was empty");
    }

    const content = await object.Body.transformToString("utf-8");
    const totalBytes = getTotalBytes(object.ContentRange, object.ContentLength);
    const bytesRead = new TextEncoder().encode(content).byteLength;

    return NextResponse.json(
      {
        content,
        bytesRead,
        truncated: totalBytes > bytesRead,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    console.error("Text preview error:", error);
    return NextResponse.json(
      { error: "Failed to load text preview" },
      { status: 500 },
    );
  }
}

function getTotalBytes(contentRange?: string, contentLength?: number) {
  const total = contentRange?.match(/\/(\d+)$/)?.[1];
  return total ? Number(total) : (contentLength ?? 0);
}
