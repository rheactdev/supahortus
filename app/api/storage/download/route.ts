import { NextResponse } from "next/server";
import { GetObjectCommand, type GetObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();

  if (!authData?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "id query parameter is required" },
      { status: 400 }
    );
  }

  try {
    // RLS enforces access — only garden members can SELECT items
    const { data: item, error: fetchError } = await supabase
      .from("items")
      .select("s3_key, name")
      .eq("id", id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const commandConfig: GetObjectCommandInput = {
      Bucket: BUCKET_NAME,
      Key: item.s3_key,
    };

    if (searchParams.get("download") === "true") {
      commandConfig.ResponseContentDisposition = `attachment; filename="${item.name}"`;
    }

    const command = new GetObjectCommand(commandConfig);
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    if (searchParams.get("action") === "download") {
      return NextResponse.redirect(url);
    }

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Download presign error:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
