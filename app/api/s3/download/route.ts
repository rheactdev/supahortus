import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { createClient } from "@/lib/supabase/server";

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

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      // Optional: Force a secure download rather than inline display
      // ResponseContentDisposition: `attachment; filename="${key.split('/').pop()}"`
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    // We could return JSON containing the URL, or redirect directly to the presigned URL.
    // Redirecting is usually nicer for instant browser downloads. 
    // However, if we just want to fetch the URL client-side for "copy to clipboard" feature, 
    // we should return JSON. Let's redirect if 'action=download', else return JSON.
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
