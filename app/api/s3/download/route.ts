import { NextResponse } from "next/server";
import { GetObjectCommand, type GetObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";
import { checkAccess } from "@/lib/auth";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Key query parameter is required" }, { status: 400 });
  }

  // Check folder access
  const { allowed } = await checkAccess(supabase, authData.user, key);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // FIX: Use the native AWS type instead of Record<string, string>
    const commandConfig: GetObjectCommandInput = {
      Bucket: BUCKET_NAME,
      Key: key,
    };

    if (searchParams.get("download") === "true") {
      commandConfig.ResponseContentDisposition = `attachment; filename="${key.split('/').pop()}"`;
    }

    const command = new GetObjectCommand(commandConfig);

    const isShare = searchParams.get("share") === "true";
    const expiresIn = isShare ? 604800 : 3600;

    const url = await getSignedUrl(s3Client, command, { expiresIn });

    const action = searchParams.get("action");
    if (action === 'download') {
      return NextResponse.redirect(url);
    }

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Download presign error:", error);
    return NextResponse.json({ error: "Failed to generate download URL" }, { status: 500 });
  }
}