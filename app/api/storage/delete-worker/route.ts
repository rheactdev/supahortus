import { NextResponse } from "next/server";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { Receiver } from "@upstash/qstash";
import { s3Client, BUCKET_NAME } from "@/lib/s3";

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request) {
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

  const { keys } = JSON.parse(body) as { keys: string[] };

  if (!keys || keys.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  try {
    let deleted = 0;
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        })
      );
      deleted += batch.length;
    }

    console.log(`[delete-worker] Deleted ${deleted} objects from S3`);
    return NextResponse.json({ deleted });
  } catch (error) {
    console.error("Delete worker error:", error);
    return NextResponse.json({ error: "Worker failed" }, { status: 500 });
  }
}
