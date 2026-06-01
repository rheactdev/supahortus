import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/db";
import { headers } from "next/headers";

export async function POST(request: Request) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const { itemId } = await request.json();

    if (!itemId) {
      return NextResponse.json({ error: "itemId is required" }, { status: 400 });
    }

    // Fetch item and verify membership
    const stmt = db.prepare(`SELECT garden_id, status FROM items WHERE id = ?`);
    const item = stmt.get(itemId) as any;

    if (!item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Verify user is a member with upload permission
    const memStmt = db.prepare(`SELECT can_upload FROM garden_members WHERE garden_id = ? AND user_id = ?`);
    const membership = memStmt.get(item.garden_id, userId) as any;

    if (!membership?.can_upload) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (item.status === "ready") {
      return NextResponse.json({ confirmed: true });
    }

    const updateStmt = db.prepare(`UPDATE items SET status = 'ready' WHERE id = ?`);
    updateStmt.run(itemId);

    return NextResponse.json({ confirmed: true });
  } catch (error) {
    console.error("Confirm error:", error);
    return NextResponse.json(
      { error: "Failed to confirm upload" },
      { status: 500 }
    );
  }
}
