import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";
import { checkAccess } from "@/lib/auth";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { prefix = "", folderName } = await request.json();

    if (!folderName || typeof folderName !== "string" || folderName.includes("/")) {
      return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
    }

    const folderKey = `${prefix}${folderName}/`;

    // Check folder access (prefix must be accessible to create subfolders)
    const { allowed } = await checkAccess(supabase, authData.user, prefix || folderKey);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: folderKey,
      Body: "",
    });

    await s3Client.send(command);

    return NextResponse.json({
      success: true,
      folderKey,
    });
  } catch (error) {
    console.error("Folder creation error:", error);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
