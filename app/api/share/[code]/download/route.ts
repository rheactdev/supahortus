import { NextResponse } from "next/server";
import { getSharedItemDownloadUrl } from "@/lib/item-share";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const itemId = new URL(request.url).searchParams.get("id");
  const url = await getSharedItemDownloadUrl(code, itemId ?? undefined);

  if (!url) {
    return NextResponse.json(
      { error: "Shared file not found" },
      { status: 404 },
    );
  }

  return NextResponse.redirect(url);
}
