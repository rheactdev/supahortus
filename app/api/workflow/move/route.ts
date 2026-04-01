import { serve } from "@upstash/workflow/nextjs";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { supabaseAdmin } from "@/lib/supabase/admin";

type MovePayload = {
  gardenId: string;
  itemId: string;
  newParentId: string | null;
  newParentS3Key: string; // e.g. "{garden_id}/" for root, or "{garden_id}/photos/"
};

const BATCH_SIZE = 500;

export const { POST } = serve<MovePayload>(
  async (context) => {
    const { gardenId, itemId, newParentId, newParentS3Key } =
      context.requestPayload;

    // Step 1: Fetch the item and compute new s3_key prefix
    const { item, oldPrefix, newPrefix } = await context.run(
      "compute-prefixes",
      async () => {
        const { data, error } = await supabaseAdmin
          .from("items")
          .select("id, name, s3_key, type, parent_id")
          .eq("id", itemId)
          .single();

        if (error || !data) throw new Error("Item not found");

        const isFolder = data.type === "folder";
        const suffix = isFolder ? `${data.name}/` : data.name;
        const computedNewPrefix = `${newParentS3Key}${suffix}`;

        return {
          item: data,
          oldPrefix: data.s3_key,
          newPrefix: computedNewPrefix,
        };
      }
    );

    // Step 2: Fetch all descendant s3_keys (folders include themselves)
    const descendants = await context.run("fetch-keys", async () => {
      if (item.type !== "folder") return [];

      const { data, error } = await supabaseAdmin
        .from("items")
        .select("id, s3_key")
        .like("s3_key", `${oldPrefix}%`)
        .neq("id", itemId);

      if (error) throw error;
      return data || [];
    });

    // Step 3: Copy S3 objects in batches
    const batches = [];
    for (let i = 0; i < descendants.length; i += BATCH_SIZE) {
      batches.push(descendants.slice(i, i + BATCH_SIZE));
    }

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      await context.run(`copy-batch-${i}`, async () => {
        await Promise.all(
          batch.map(async (desc) => {
            const newKey = desc.s3_key.replace(oldPrefix, newPrefix);
            const encodedOld = desc.s3_key
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
    }

    // Step 4: Delete old S3 objects in batches
    const allOldKeys = [
      oldPrefix,
      ...descendants.map((d) => d.s3_key),
    ];

    for (let i = 0; i < allOldKeys.length; i += 1000) {
      const batch = allOldKeys.slice(i, i + 1000);
      await context.run(`delete-s3-batch-${i}`, async () => {
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: { Objects: batch.map((Key) => ({ Key })) },
          })
        );
      });
    }

    // For a single file, also copy its own key
    if (item.type !== "folder") {
      await context.run("copy-single-file", async () => {
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
      });
    } else {
      // Copy folder marker
      await context.run("copy-folder-marker", async () => {
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
      });
    }

    // Step 5: Update DB — item's parent_id, s3_key, and all descendants' s3_keys
    await context.run("update-db", async () => {
      // Update the moved item itself
      await supabaseAdmin
        .from("items")
        .update({ parent_id: newParentId, s3_key: newPrefix })
        .eq("id", itemId);

      // Update all descendants' s3_keys
      for (const desc of descendants) {
        const newKey = desc.s3_key.replace(oldPrefix, newPrefix);
        await supabaseAdmin
          .from("items")
          .update({ s3_key: newKey })
          .eq("id", desc.id);
      }
    });

    // Step 6: Revalidate cache
    await context.call("revalidate-cache", {
      url: `${process.env.UPSTASH_WORKFLOW_URL}/api/revalidate?tag=garden-${gardenId}`,
      method: "POST",
    });
  },
  {
    failureFunction: async ({ failStatus, failResponse }) => {
      console.error(`[workflow/move] Failed (${failStatus}):`, failResponse);
    },
  }
);
