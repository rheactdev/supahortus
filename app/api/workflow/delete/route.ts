import { serve } from "@upstash/workflow/nextjs";
import {
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import db from "@/db";

type DeletePayload = {
  gardenId: string;
  itemId: string;
};

export const { POST } = serve<DeletePayload>(
  async (context) => {
    const { gardenId, itemId } = context.requestPayload;

    // Step 1: Fetch item and all descendant S3 keys
    const { s3Keys } = await context.run("fetch-keys", async () => {
      const stmt = db.prepare(`SELECT s3_key, type FROM items WHERE id = ?`);
      const item = stmt.get(itemId) as any;

      if (!item) throw new Error("Item not found");

      let keys: string[];
      if (item.type === "folder") {
        const descStmt = db.prepare(`SELECT s3_key FROM items WHERE s3_key LIKE ?`);
        const descendants = descStmt.all(`${item.s3_key}%`) as any[];
        keys = descendants.map((d) => d.s3_key);
      } else {
        keys = [item.s3_key];
      }

      return { s3Keys: keys, isFolder: item.type === "folder" };
    });

    // Step 2: Delete DB rows (CASCADE handles children for folders)
    await context.run("delete-db", async () => {
      const delStmt = db.prepare(`DELETE FROM items WHERE id = ?`);
      delStmt.run(itemId);
    });

    // Step 3: Delete S3 objects in batches of 1000
    const batches = [];
    for (let i = 0; i < s3Keys.length; i += 1000) {
      batches.push(s3Keys.slice(i, i + 1000));
    }

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      await context.run(`delete-s3-batch-${i}`, async () => {
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: { Objects: batch.map((Key) => ({ Key })) },
          })
        );
      });
    }

    // Step 4: Revalidate cache
    await context.call("revalidate-cache", {
      url: `${process.env.UPSTASH_WORKFLOW_URL}/api/revalidate?tag=garden-${gardenId}`,
      method: "POST",
    });
  },
  {
    failureFunction: async ({ failStatus, failResponse }) => {
      console.error(`[workflow/delete] Failed (${failStatus}):`, failResponse);
    },
  }
);
