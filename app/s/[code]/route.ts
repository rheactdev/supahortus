import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME } from "@/lib/s3";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> | { code: string } }
) {
  const resolvedParams = await params;
  const code = resolvedParams.code;

  if (!code) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shares')
    .select('file_key, expires_at')
    .eq('short_code', code)
    .single();

  if (error || !data) {
    console.error("Share resolve error:", error);
    return new NextResponse(
      `<div style="font-family:sans-serif;text-align:center;padding:50px;">
        <h2>Link Not Found</h2>
        <p>This share link may have expired or is invalid.</p>
      </div>`,
      { status: 404, headers: { 'content-type': 'text/html' } }
    );
  }

  if (new Date(data.expires_at) < new Date()) {
    return new NextResponse(
      `<div style="font-family:sans-serif;text-align:center;padding:50px;">
        <h2>Link Expired</h2>
        <p>This share link has expired.</p>
      </div>`,
      { status: 410, headers: { 'content-type': 'text/html' } }
    );
  }

  try {
    const fileName = data.file_key.split("/").pop() || "download";
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: data.file_key,
      ResponseContentDisposition: `attachment; filename="${fileName}"`
    });

    // We can confidently sign this for 1 hour because the actual /s/ URL handles longevity up to 7 days in the DB
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    return NextResponse.redirect(signedUrl);
  } catch (err) {
    console.error("Failed to generate presigned download:", err);
    return NextResponse.json({ error: "Failed to load resource" }, { status: 500 });
  }
}
