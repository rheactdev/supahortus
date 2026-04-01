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
    const { name, parentId } = await request.json();

    if (!name || typeof name !== "string" || name.includes("/")) {
      return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
    }

    // Build s3_key from parent chain
    let s3Key = `${name}/`;
    if (parentId) {
      const { data: parent, error: parentError } = await supabase
        .from("items")
        .select("s3_key")
        .eq("id", parentId)
        .single();

      if (parentError || !parent) {
        return NextResponse.json({ error: "Parent folder not found" }, { status: 404 });
      }
      s3Key = `${parent.s3_key}${name}/`;
    }

    // Insert folder into DB (size=null, mime_type=null = folder)
    const { data: folder, error: insertError } = await supabase
      .from("items")
      .insert({
        name,
        s3_key: s3Key,
        parent_id: parentId || null,
        owner_id: authData.user.id,
      })
      .select("id, s3_key")
      .single();

    if (insertError) throw insertError;

    // Create empty S3 object to maintain human-readable bucket
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: "",
    }));

    return NextResponse.json({ success: true, id: folder.id, s3Key: folder.s3_key });
  } catch (error) {
    console.error("Folder creation error:", error);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
