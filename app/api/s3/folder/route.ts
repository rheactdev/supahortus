import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";

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

    // S3 specifies a fully-fledged folder merely by an empty object logically terminating in a slash "/"
    const folderKey = `${prefix}${folderName}/`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: folderKey,
      Body: "", // 0-byte body
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
