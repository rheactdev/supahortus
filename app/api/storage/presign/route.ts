import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { auth } from "@/lib/auth";
import db from "@/db";
import { headers } from "next/headers";
import { buildS3Key } from "@/lib/data";

export async function POST(request: Request) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const { filename, contentType, parentId, gardenId } = await request.json();

    if (!filename || !gardenId) {
      return NextResponse.json(
        { error: "filename and gardenId are required" },
        { status: 400 }
      );
    }

    // Verify upload permission
    const stmt = db.prepare(`SELECT can_upload FROM garden_members WHERE garden_id = ? AND user_id = ?`);
    const membership = stmt.get(gardenId, userId) as any;

    if (!membership?.can_upload) {
      return NextResponse.json({ error: "No upload permission" }, { status: 403 });
    }

    const s3Key = await buildS3Key(gardenId, parentId || null, filename);

    // Insert pending item record
    const itemId = crypto.randomUUID();
    const insertStmt = db.prepare(`
      INSERT INTO items (id, name, s3_key, parent_id, garden_id, type, mime_type)
      VALUES (?, ?, ?, ?, ?, 'file', ?)
    `);
    insertStmt.run(itemId, filename, s3Key, parentId || null, gardenId, contentType || "application/octet-stream");

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return NextResponse.json({
      method: "PUT",
      url,
      headers: { "Content-Type": contentType },
      itemId,
    });
  } catch (error) {
    console.error("Presign error:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 }
    );
  }
}
