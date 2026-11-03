import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { Receiver } from "@upstash/qstash";
import { serve } from "@upstash/workflow/nextjs";
import sharp from "sharp";
import { getAppBaseUrl } from "@/lib/app-url";
import { BUCKET_NAME, s3Client } from "@/lib/s3";
import { deleteStorageKeys } from "@/lib/storage-delete";
import {
  encryptionInput,
  preserveUploadKeyMarker,
  requireUploadedObject,
  signObject,
} from "@/lib/storage-encryption";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { needsThumbnailGeneration, processorFileType } from "@/lib/thumbnail-types";
import type { ThumbnailPayload } from "@/lib/thumbnail-workflow";

const MAX_CARD_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_CARD_SOURCE_PIXELS = 64_000_000;

async function processDesignPreview(sourceKey: string, outputKey: string, fileType: "psd" | "af") {
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

async function readCardSource(sourceKey: string) {
  const { Body, ContentLength } = await s3Client.send(new GetObjectCommand({
    Bucket: BUCKET_NAME, Key: sourceKey, ...encryptionInput(sourceKey),
  }));
  if (!Body) throw new Error("Thumbnail source is unavailable");

  const reader = Body.transformToWebStream().getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    if (ContentLength !== undefined && ContentLength > MAX_CARD_SOURCE_BYTES) {
      throw new Error("Thumbnail source is too large");
    }
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_CARD_SOURCE_BYTES) throw new Error("Thumbnail source is too large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}

async function processCardThumbnail(sourceKey: string, outputKey: string) {
  const source = await readCardSource(sourceKey);
  const image = sharp(source, { limitInputPixels: MAX_CARD_SOURCE_PIXELS });
  const { format } = await image.metadata();
  if (format !== "jpeg" && format !== "png" && format !== "webp") {
    throw new Error("Unsupported thumbnail source format");
  }
  const body = await image
    .autoOrient()
    .resize(480, 480, { fit: "inside", withoutEnlargement: true })
    .webp()
    .toBuffer();
  await s3Client.send(new PutObjectCommand({
    Bucket: BUCKET_NAME, Key: outputKey, Body: body,
    ContentType: "image/webp", ...encryptionInput(outputKey),
  }));
}

const { POST: handleWorkflow } = serve<ThumbnailPayload>(async (context) => {
  const { gardenId, itemId } = context.requestPayload;

  async function getReadyFile() {
    const { data, error } = await supabaseAdmin.from("items")
      .select("name, s3_key, thumbnail_key, card_thumbnail_key")
      .eq("id", itemId).eq("garden_id", gardenId)
      .eq("type", "file").eq("status", "ready").maybeSingle();
    if (error) throw error;
    return data;
  }

  const job = await context.run("prepare-thumbnail", async () => {
    const item = await getReadyFile();
    if (!item || !needsThumbnailGeneration(item.name, item)) return null;

    const fileType = processorFileType(item.name);
    const runSuffix = createHash("sha256").update(context.workflowRunId).digest("hex").slice(0, 32);
    const prefix = item.s3_key.slice(0, item.s3_key.lastIndexOf("/") + 1);
    return {
      name: item.name,
      sourceKey: item.s3_key,
      fileType,
      existingPreviewKey: item.thumbnail_key,
      previewOutputKey: preserveUploadKeyMarker(
        item.s3_key, `${prefix}.thumbnail-${itemId}-${runSuffix}_thumb.webp`,
      ),
      cardOutputKey: preserveUploadKeyMarker(
        item.s3_key, `${prefix}.card-thumbnail-${itemId}-${runSuffix}.webp`,
      ),
    };
  });

  if (!job) return;

  const matchesJob = (item: Awaited<ReturnType<typeof getReadyFile>>) =>
    item?.s3_key === job.sourceKey && item.name === job.name;

  const cacheRevalidation = {
    url: `${getAppBaseUrl()}/api/revalidate?tag=garden-${gardenId}`,
    method: "POST" as const,
    headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : undefined,
  };

  const fileType = job.fileType;
  const previewKey = fileType && !job.existingPreviewKey
    ? await context.run("publish-design-preview", async () => {
      const item = await getReadyFile();
      if (item?.thumbnail_key === job.previewOutputKey) return job.previewOutputKey;
      if (!item || !matchesJob(item) || item.thumbnail_key) {
        await deleteStorageKeys([job.previewOutputKey]);
        return item && matchesJob(item) ? item.thumbnail_key : null;
      }

      try {
        await processDesignPreview(job.sourceKey, job.previewOutputKey, fileType);
      } catch {
        await deleteStorageKeys([job.previewOutputKey]);
        throw new Error("Design preview processing failed");
      }

      const { data, error } = await supabaseAdmin.from("items")
        .update({ thumbnail_key: job.previewOutputKey })
        .eq("id", itemId).eq("garden_id", gardenId)
        .eq("type", "file").eq("status", "ready").eq("s3_key", job.sourceKey).eq("name", job.name)
        .is("thumbnail_key", null).select("id").maybeSingle();
      if (error) throw error;
      if (data) return job.previewOutputKey;

      const current = await getReadyFile();
      if (current?.thumbnail_key === job.previewOutputKey) return job.previewOutputKey;
      await deleteStorageKeys([job.previewOutputKey]);
      return current && matchesJob(current) ? current.thumbnail_key : null;
    })
    : fileType ? job.existingPreviewKey : null;

  if (fileType && !previewKey) return;
  if (previewKey === job.previewOutputKey) {
    await context.call("revalidate-preview-cache", cacheRevalidation);
  }

  const published = await context.run("publish-card-thumbnail", async () => {
    const item = await getReadyFile();
    if (item?.card_thumbnail_key === job.cardOutputKey) return true;
    if (!item || !matchesJob(item) || item.card_thumbnail_key ||
        (fileType && item.thumbnail_key !== previewKey)) {
      await deleteStorageKeys([job.cardOutputKey]);
      return false;
    }

    try {
      await processCardThumbnail(previewKey ?? job.sourceKey, job.cardOutputKey);
    } catch {
      await deleteStorageKeys([job.cardOutputKey]);
      throw new Error("Card thumbnail processing failed");
    }

    let update = supabaseAdmin.from("items")
      .update({ card_thumbnail_key: job.cardOutputKey })
      .eq("id", itemId).eq("garden_id", gardenId)
      .eq("type", "file").eq("status", "ready").eq("s3_key", job.sourceKey).eq("name", job.name)
      .is("card_thumbnail_key", null);
    if (previewKey) update = update.eq("thumbnail_key", previewKey);
    const { data, error } = await update.select("id").maybeSingle();
    if (error) throw error;
    if (data || (await getReadyFile())?.card_thumbnail_key === job.cardOutputKey) return true;

    await deleteStorageKeys([job.cardOutputKey]);
    return false;
  });

  if (published) await context.call("revalidate-cache", cacheRevalidation);
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
