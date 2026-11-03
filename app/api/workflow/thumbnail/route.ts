import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Receiver } from "@upstash/qstash";
import { serve } from "@upstash/workflow/nextjs";
import { getAppBaseUrl } from "@/lib/app-url";
import { BUCKET_NAME } from "@/lib/s3";
import { deleteStorageKeys } from "@/lib/storage-delete";
import {
  encryptionInput,
  preserveUploadKeyMarker,
  requireUploadedObject,
  signObject,
} from "@/lib/storage-encryption";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { processorFileType } from "@/lib/thumbnail-types";
import type { ThumbnailPayload } from "@/lib/thumbnail-workflow";

async function processThumbnail(sourceKey: string, outputKey: string, fileType: "psd" | "af") {
  const processorUrl = process.env.IMAGE_PROCESSOR_URL;
  const secret = process.env.PROCESSOR_SECRET;
  if (!processorUrl || !secret) throw new Error("Thumbnail processor is not configured");

  const endpoint = new URL(`${processorUrl.replace(/\/+$/, "")}/process`);
  if (endpoint.protocol !== "https:") throw new Error("Thumbnail processor requires HTTPS");

  const [source, destination] = await Promise.all([
    signObject(new GetObjectCommand({
      Bucket: BUCKET_NAME, Key: sourceKey, ...encryptionInput(sourceKey),
    })),
    signObject(new PutObjectCommand({
      Bucket: BUCKET_NAME, Key: outputKey, ContentType: "image/webp", ...encryptionInput(outputKey),
    })),
  ]);

  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({
      sourceUrl: source.url,
      destinationUrl: destination.url,
      fileType,
      sourceHeaders: Object.keys(source.headers).length ? source.headers : undefined,
      destinationHeaders: Object.keys(destination.headers).length ? destination.headers : undefined,
    }),
  });

  if (!response.ok) throw new Error(`Thumbnail processor returned HTTP ${response.status}`);
  await requireUploadedObject(outputKey);
}

const { POST: handleWorkflow } = serve<ThumbnailPayload>(async (context) => {
  const { gardenId, itemId } = context.requestPayload;

  async function getReadyFile() {
    const { data, error } = await supabaseAdmin.from("items")
      .select("name, s3_key, thumbnail_key")
      .eq("id", itemId).eq("garden_id", gardenId)
      .eq("type", "file").eq("status", "ready").maybeSingle();
    if (error) throw error;
    return data;
  }

  const job = await context.run("prepare-thumbnail", async () => {
    const item = await getReadyFile();
    if (!item || item.thumbnail_key) return null;

    const fileType = processorFileType(item.name);
    if (!fileType) return null;

    const runSuffix = createHash("sha256").update(context.workflowRunId).digest("hex").slice(0, 32);
    const prefix = item.s3_key.slice(0, item.s3_key.lastIndexOf("/") + 1);
    const outputKey = preserveUploadKeyMarker(
      item.s3_key, `${prefix}.thumbnail-${itemId}-${runSuffix}_thumb.webp`,
    );
    return { sourceKey: item.s3_key, outputKey, fileType };
  });

  if (!job) return;

  const published = await context.run("process-and-publish-thumbnail", async () => {
    const item = await getReadyFile();
    if (item?.thumbnail_key === job.outputKey) return true;

    if (!item || item.s3_key !== job.sourceKey || item.thumbnail_key ||
        processorFileType(item.name) !== job.fileType) {
      await deleteStorageKeys([job.outputKey]);
      return false;
    }

    try {
      await processThumbnail(job.sourceKey, job.outputKey, job.fileType);
    } catch {
      await deleteStorageKeys([job.outputKey]);
      throw new Error("Thumbnail processing failed");
    }

    const { data, error } = await supabaseAdmin.from("items")
      .update({ thumbnail_key: job.outputKey })
      .eq("id", itemId).eq("garden_id", gardenId)
      .eq("type", "file").eq("status", "ready").eq("s3_key", job.sourceKey)
      .is("thumbnail_key", null)
      .select("id").maybeSingle();
    if (error) throw error;
    if (data) return true;

    if ((await getReadyFile())?.thumbnail_key === job.outputKey) return true;
    await deleteStorageKeys([job.outputKey]);
    return false;
  });

  if (published) {
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    await context.call("revalidate-cache", {
      url: `${getAppBaseUrl()}/api/revalidate?tag=garden-${gardenId}`,
      method: "POST",
      headers: bypass ? { "x-vercel-protection-bypass": bypass } : undefined,
    });
  }
}, {
  receiver: new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
  }),
  failureFunction: async ({ failStatus }) => {
    console.error(`[workflow/thumbnail] Failed (${failStatus})`);
  },
});

export async function POST(request: Request) {
  if (!process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
    return new Response("Thumbnail workflow signing is unavailable", { status: 503 });
  }

  return handleWorkflow(request);
}
