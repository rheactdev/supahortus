import { serve } from "@upstash/workflow/nextjs";
import { Receiver } from "@upstash/qstash";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppBaseUrl } from "@/lib/app-url";
import { getGardenStoragePrefix } from "@/lib/garden-storage";
import { deleteStorageKeys } from "@/lib/storage-delete";

type DeletePayload = {
  gardenId: string;
  itemId: string;
};

type StoredKeys = {
  s3_key: string;
  thumbnail_key: string | null;
  preview_key: string | null;
};

async function readTarget({ gardenId, itemId }: DeletePayload) {
  const { data, error } = await supabaseAdmin
    .from("items")
    .select("s3_key, thumbnail_key, preview_key, type")
    .eq("garden_id", gardenId)
    .eq("id", itemId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function keysWithinPrefix(item: StoredKeys, prefix: string) {
  return [item.s3_key, item.thumbnail_key, item.preview_key].filter(
    (key): key is string => typeof key === "string" && key.startsWith(prefix),
  );
}

export const { POST } = serve<DeletePayload>(
  async (context) => {
    const payload = context.requestPayload;
    const { gardenId, itemId } = payload;
    const target = await context.run("read-delete-target", async () => {
      const item = await readTarget(payload);
      if (!item) return null;

      const gardenPrefix = await getGardenStoragePrefix(gardenId);
      if (
        !item.s3_key.startsWith(gardenPrefix) ||
        item.s3_key === gardenPrefix ||
        (item.type === "folder" && !item.s3_key.endsWith("/"))
      ) {
        throw new Error("Item has an invalid storage path");
      }
      return { item, gardenPrefix };
    });

    if (!target) return;
    const { item, gardenPrefix } = target;

    if (item.type === "folder") {
      const prefix = item.s3_key;
      const escapedPrefix = prefix.replace(/[\\%_]/g, "\\$&");
      let afterId: string | null = null;
      let page = 0;

      do {
        const cursor: string | null = afterId;
        afterId = await context.run(`delete-descendants-${page++}`, async (): Promise<string | null> => {
          const current = await readTarget(payload);
          if (current?.s3_key !== prefix) return null;

          // Each row can reference up to three keys, so one page fits in a delete batch.
          let query = supabaseAdmin
            .from("items")
            .select("id, s3_key, thumbnail_key, preview_key")
            .eq("garden_id", gardenId)
            .neq("id", itemId)
            .like("s3_key", `${escapedPrefix}%`)
            .order("id")
            .limit(300);
          if (cursor) query = query.gt("id", cursor);

          const { data, error } = await query;
          if (error) throw error;
          if (!data?.length) return null;

          const keys = data
            .filter((descendant) => descendant.s3_key.startsWith(prefix))
            .flatMap((descendant) => keysWithinPrefix(descendant, prefix));
          await deleteStorageKeys([...new Set(keys)]);
          return data[data.length - 1].id;
        });
      } while (afterId);
    }

    await context.run("delete-target-storage", async () => {
      const current = await readTarget(payload);
      if (!current || current.s3_key !== item.s3_key) return;

      const prefix = item.type === "folder" ? item.s3_key : gardenPrefix;
      await deleteStorageKeys([...new Set(keysWithinPrefix(current, prefix))]);
    });

    // Retain the item rows until storage acknowledges the deletion, so retries
    // can find the same target and its names remain reserved during cleanup.
    await context.run("delete-target-record", async () => {
      const { error } = await supabaseAdmin
        .from("items")
        .delete()
        .eq("garden_id", gardenId)
        .eq("id", itemId)
        .eq("s3_key", item.s3_key);
      if (error) throw error;
    });

    await context.call("revalidate-cache", {
      url: `${getAppBaseUrl()}/api/revalidate?tag=garden-${gardenId}`,
      method: "POST",
    });
  },
  {
    receiver: new Receiver({}),
    failureFunction: async ({ failStatus, failResponse }) => {
      console.error(`[workflow/delete] Failed (${failStatus}):`, failResponse);
    },
  }
);
