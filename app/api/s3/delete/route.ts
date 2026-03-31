import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";
import { checkAccess } from "@/lib/auth";

export async function DELETE(request: Request) {
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
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete object error:", error);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
