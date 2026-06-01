import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import db from "@/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> | { code: string } }
) {
  const resolvedParams = await params;
  const code = resolvedParams.code;

  if (!code) {
    return NextResponse.redirect(new URL("/my-gardens", request.url));
  }

  // Use admin client since share links are public (no user session required)
  const stmt = db.prepare(`
    SELECT s.expires_at, i.s3_key, i.name 
    FROM shares s 
    JOIN items i ON s.item_id = i.id 
    WHERE s.short_code = ?
  `);
  const data = stmt.get(code) as any;

  if (!data || !data.s3_key) {
    return new NextResponse(
      `<div style="font-family:sans-serif;text-align:center;padding:50px;">
        <h2>Link Not Found</h2>
        <p>This share link may have expired or is invalid.</p>
      </div>`,
      { status: 404, headers: { "content-type": "text/html" } }
    );
  }

  if (new Date(data.expires_at) < new Date()) {
    return new NextResponse(
      `<div style="font-family:sans-serif;text-align:center;padding:50px;">
        <h2>Link Expired</h2>
        <p>This share link has expired.</p>
      </div>`,
      { status: 410, headers: { "content-type": "text/html" } }
    );
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: data.s3_key,
      ResponseContentDisposition: `attachment; filename="${data.name}"`,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return NextResponse.redirect(signedUrl);
  } catch (err) {
    console.error("Failed to generate presigned download:", err);
    return NextResponse.json({ error: "Failed to load resource" }, { status: 500 });
  }
}
