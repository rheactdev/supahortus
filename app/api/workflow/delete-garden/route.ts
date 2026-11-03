import {
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Receiver } from "@upstash/qstash";
import { serve } from "@upstash/workflow/nextjs";
import { recordGardenCleanupFailure } from "@/lib/garden-cleanup";
import { BUCKET_NAME, s3Client } from "@/lib/s3";
import { deleteStorageKeys } from "@/lib/storage-delete";
import { STORAGE_URL_LIFETIME_SECONDS } from "@/lib/storage-encryption";
import { supabaseAdmin } from "@/lib/supabase/admin";

async function getPendingDeletion(gardenId: string) {
  const { data, error } = await supabaseAdmin
    .from("garden_deletions")
    .select("storage_prefix, requested_at")
    .eq("garden_id", gardenId)
    .is("completed_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function abortMultipartPage(prefix: string) {
  const { Uploads } = await s3Client.send(new ListMultipartUploadsCommand({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
    MaxUploads: 100,
  }));

  for (const { Key, UploadId } of Uploads ?? []) {
    if (!Key?.startsWith(prefix) || !UploadId) throw new Error("Invalid multipart upload entry");
    try {
      await s3Client.send(new AbortMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key,
        UploadId,
      }));
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "NoSuchUpload") throw error;
    }
  }
  return Uploads?.length ?? 0;
}

async function deleteObjectPage(prefix: string) {
  const { Contents } = await s3Client.send(new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
    MaxKeys: 1000,
  }));
  const keys = (Contents ?? []).map(({ Key }) => {
    if (!Key?.startsWith(prefix)) throw new Error("Object is outside the garden storage prefix");
    return Key;
  });

  await deleteStorageKeys(keys);
  return keys.length;
}

export const { POST } = serve<{ gardenId: string }>(async (context) => {
  const { gardenId } = context.requestPayload;
  const job = await context.run("load-pending-deletion", async () => {
    const data = await getPendingDeletion(gardenId);
    if (!data) return null;
    const expiresAt = Date.parse(data.requested_at) + STORAGE_URL_LIFETIME_SECONDS * 1000;
    return { secondsUntilExpiry: Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)) };
  });
  if (!job) return;

  if (job.secondsUntilExpiry) {
    await context.sleep("wait-for-upload-urls", job.secondsUntilExpiry);
  }

  // Each step removes the first page. An empty page confirms there is no more work.
  for (let page = 0; ; page++) {
    const count = await context.run(`abort-multipart-page-${page}`, async () => {
      const pending = await getPendingDeletion(gardenId);
      return pending ? abortMultipartPage(pending.storage_prefix) : 0;
    });
    if (count === 0) break;
  }

  for (let page = 0; ; page++) {
    const count = await context.run(`delete-object-page-${page}`, async () => {
      const pending = await getPendingDeletion(gardenId);
      return pending ? deleteObjectPage(pending.storage_prefix) : 0;
    });
    if (count === 0) break;
  }

  await context.run("complete-deletion", async () => {
    const { error } = await supabaseAdmin
      .from("garden_deletions")
      .update({ completed_at: new Date().toISOString(), last_error: null })
      .eq("garden_id", gardenId)
      .is("completed_at", null);
    if (error) throw error;
  });
}, {
  receiver: new Receiver({
    currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
    nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
  }),
  failureFunction: async ({ context, failStatus }) => {
    console.error(`[workflow/delete-garden] Failed (${failStatus})`);
    await recordGardenCleanupFailure(context.requestPayload.gardenId, "Storage cleanup failed");
  },
});
