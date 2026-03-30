import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  // prefix can be empty or something like "user-abc/Docs/"
  let prefix = searchParams.get("prefix") || "";
  
  // Enforce root folder prefix to be the user's ID to keep users separated
  // But wait, the user said "i want the app to be able to read files i dump in the bucket".
  // This implies they probably want access to the whole bucket. "so my lazy ass can just dl it if i want"
  // Let's scope it to the bucket level, but maybe default to the whole bucket if no separation is requested.
  // Actually, I should just provide access to the whole B2 bucket as a personal drive.

  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      Delimiter: "/", // Essential for retrieving Folders (CommonPrefixes)
    });

    const data = await s3Client.send(command);

    const folders = (data.CommonPrefixes || []).map((p) => p.Prefix);
    const files = (data.Contents || []).map((file) => ({
      key: file.Key,
      size: file.Size,
      lastModified: file.LastModified,
      eTag: file.ETag,
    })).filter((f) => f.key !== prefix); // don't return the "folder" object itself if it exists

    return NextResponse.json({ folders, files, currentPrefix: prefix });
  } catch (error) {
    console.error("Listing error:", error);
    return NextResponse.json({ error: "Failed to list objects" }, { status: 500 });
  }
}
