import { NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";
import { checkAccess, getSharedPrefixes } from "@/lib/auth";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let prefix = searchParams.get("prefix") || "";

  const isAdmin = authData.user.app_metadata?.role === "admin";

  // Non-admin at root: return virtual folders from their shares
  if (!isAdmin && prefix === "") {
    const sharedPrefixes = await getSharedPrefixes(supabase, authData.user.email!);
    // Return the shared prefixes as virtual folders, no files at root
    return NextResponse.json({
      folders: sharedPrefixes,
      files: [],
      currentPrefix: prefix,
    });
  }

  // Non-admin navigating into a folder: verify they have access
  if (!isAdmin) {
    const { allowed } = await checkAccess(supabase, authData.user, prefix);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      Delimiter: "/",
    });

    const data = await s3Client.send(command);

    const folders = (data.CommonPrefixes || []).map((p) => p.Prefix);
    const files = (data.Contents || []).map((file) => ({
      key: file.Key,
      size: file.Size,
      lastModified: file.LastModified,
      eTag: file.ETag,
    })).filter((f) => f.key !== prefix);

    return NextResponse.json({ folders, files, currentPrefix: prefix });
  } catch (error) {
    console.error("Listing error:", error);
    return NextResponse.json({ error: "Failed to list objects" }, { status: 500 });
  }
}
