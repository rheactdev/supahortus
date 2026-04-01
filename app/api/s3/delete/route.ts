import { NextResponse } from "next/server";
import { DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
  }

  try {
    // Fetch item (RLS enforces ownership)
    const { data: item, error: fetchError } = await supabase
      .from("items")
      .select("id, s3_key, size")
      .eq("id", id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const isFolder = item.size === null;

    if (isFolder) {
      // Collect all descendant s3_keys for S3 cleanup
      const { data: descendants } = await supabase
        .from("items")
        .select("s3_key")
        .like("s3_key", `${item.s3_key}%`);

      const keys = (descendants || []).map((d) => d.s3_key);
      for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        }));
      }
    } else {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: item.s3_key,
      }));
    }

    // Delete from DB (CASCADE handles children for folders)
    const { error: deleteError } = await supabase
      .from("items")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
