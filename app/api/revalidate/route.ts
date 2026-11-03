import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Receiver } from "@upstash/qstash";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request) {
  // Verify the request comes from Upstash (Workflow uses QStash under the hood)
  const body = await request.text();
  const signature = request.headers.get("upstash-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  try {
    await receiver.verify({ body, signature, url: request.url });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tag = searchParams.get("tag");

  if (!tag) {
    return NextResponse.json(
      { error: "tag query parameter is required" },
      { status: 400 }
    );
  }

  revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ revalidated: true, tag });
}
