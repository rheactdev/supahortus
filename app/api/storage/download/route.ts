import { NextResponse } from "next/server";
import { GetObjectCommand, type GetObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { auth } from "@/lib/auth";
import db from "@/db";
import { headers } from "next/headers";

export async function GET(request: Request) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "id query parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Verify item and membership manually since we don't have RLS
    const stmt = db.prepare(`SELECT garden_id, s3_key, name FROM items WHERE id = ?`);
    const item = stmt.get(id) as any;

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const memStmt = db.prepare(`SELECT role FROM garden_members WHERE garden_id = ? AND user_id = ?`);
    const membership = memStmt.get(item.garden_id, userId);

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const commandConfig: GetObjectCommandInput = {
      Bucket: BUCKET_NAME,
      Key: item.s3_key,
    };

    if (searchParams.get("download") === "true") {
      commandConfig.ResponseContentDisposition = `attachment; filename="${item.name}"`;
    }

    const command = new GetObjectCommand(commandConfig);
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    if (searchParams.get("action") === "download") {
      return NextResponse.redirect(url);
    }

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Download presign error:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 }
    );
  }
}
