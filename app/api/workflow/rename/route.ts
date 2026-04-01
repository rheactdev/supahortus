import { serve } from "@upstash/workflow/nextjs";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { supabaseAdmin } from "@/lib/supabase/admin";

type RenamePayload = {
  gardenId: string;
  folderId: string;
  oldPrefix: string;
  newPrefix: string;
};

const BATCH_SIZE = 500;

export const { POST } = serve<RenamePayload>(
  async (context) => {
    const { gardenId, folderId, oldPrefix, newPrefix } = context.requestPayload;

    // Step 1: Fetch all descendant items with stale s3_keys
    const descendants = await context.run("fetch-keys", async () => {
      const { data, error } = await supabaseAdmin
        .from("items")
        .select("id, s3_key")
        .like("s3_key", `${oldPrefix}%`)
        .neq("id", folderId);

      if (error) throw error;
      return data || [];
    });

    // Step 2: Copy + delete S3 objects in batches
    const batches = [];
    for (let i = 0; i < descendants.length; i += BATCH_SIZE) {
      batches.push(descendants.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      // Copy batch to new keys
      await context.run(`copy-batch-${i}`, async () => {
        await Promise.all(
          batch.map(async (item) => {
            const newKey = item.s3_key.replace(oldPrefix, newPrefix);
            const encodedOld = item.s3_key
              .split("/")
              .map(encodeURIComponent)
              .join("/");
            await s3Client.send(
              new CopyObjectCommand({
                Bucket: BUCKET_NAME,
                CopySource: `${BUCKET_NAME}/${encodedOld}`,
                Key: newKey,
              })
            );
          })
        );
      });

      // Delete old keys + update DB
      await context.run(`delete-update-batch-${i}`, async () => {
        await Promise.all(
          batch.map(async (item) => {
            const newKey = item.s3_key.replace(oldPrefix, newPrefix);
            await Promise.all([
              s3Client.send(
                new DeleteObjectCommand({
                  Bucket: BUCKET_NAME,
                  Key: item.s3_key,
                })
              ),
              supabaseAdmin
                .from("items")
                .update({ s3_key: newKey })
                .eq("id", item.id),
            ]);
          })
        );
      });
    }

    // Step 3: Rename the folder's own S3 marker object
    await context.run("rename-folder-marker", async () => {
      const encodedOld = oldPrefix
        .split("/")
        .map(encodeURIComponent)
        .join("/");
      await s3Client.send(
        new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: `${BUCKET_NAME}/${encodedOld}`,
          Key: newPrefix,
        })
      );
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: oldPrefix,
        })
      );
    });

    // Step 4: Revalidate cache
    await context.call("revalidate-cache", {
      url: `${process.env.UPSTASH_WORKFLOW_URL}/api/revalidate?tag=garden-${gardenId}`,
      method: "POST",
    });
  },
  {
    failureFunction: async ({ failStatus, failResponse }) => {
      console.error(`[workflow/rename] Failed (${failStatus}):`, failResponse);
    },
  }
);
