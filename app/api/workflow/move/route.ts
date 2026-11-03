import { serve } from "@upstash/workflow/nextjs";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppBaseUrl } from "@/lib/app-url";
import { preserveUploadKeyMarker, relocatedThumbnailKey } from "@/lib/storage-encryption";
import { getRelocationDescendants, relocateStoredItem, replaceStoragePrefix } from "@/lib/storage-relocation";

type MovePayload = {
  gardenId: string;
  itemId: string;
  newParentId: string | null;
  newParentS3Key: string;
};

export const { POST } = serve<MovePayload>(async (context) => {
  const { gardenId, itemId, newParentId, newParentS3Key } = context.requestPayload;

  const { item, destination, descendants } = await context.run("prepare-relocation", async () => {
    const { data: item, error } = await supabaseAdmin.from("items")
      .select("id, name, s3_key, thumbnail_key, card_thumbnail_key, type").eq("id", itemId)
      .eq("garden_id", gardenId).eq("status", "ready").single();
    if (error || !item) throw new Error("Item not found");

    if (item.type !== "folder") {
      return {
        item,
        destination: preserveUploadKeyMarker(item.s3_key, newParentS3Key + item.name),
        descendants: [],
      };
    }

    const destination = newParentS3Key + item.name + "/";
    if (destination === item.s3_key) return { item, destination, descendants: [] };
    if (destination.startsWith(item.s3_key)) throw new Error("Cannot move a folder into itself");
    const descendants = await getRelocationDescendants(gardenId, itemId, item.s3_key);
    return { item, destination, descendants };
  });

  for (let index = 0; index < descendants.length; index += 25) {
    await context.run(`relocate-descendants-${index}`, async () => {
      await Promise.all(descendants.slice(index, index + 25).map((entry) =>
        relocateStoredItem(
          entry,
          replaceStoragePrefix(entry.s3_key, item.s3_key, destination),
          entry.thumbnail_key && replaceStoragePrefix(entry.thumbnail_key, item.s3_key, destination),
        ),
      ));
    });
  }

  await context.run("relocate-item", async () => {
    const thumbnail = item.thumbnail_key && relocatedThumbnailKey(item.thumbnail_key, destination, item.id);
    await relocateStoredItem(item, destination, thumbnail, { parent_id: newParentId });
  });

  await context.call("revalidate-cache", {
    url: `${getAppBaseUrl()}/api/revalidate?tag=garden-${gardenId}`,
    method: "POST",
  });
}, {
  failureFunction: async ({ failStatus }) => {
    console.error(`[workflow/move] Failed (${failStatus})`);
  },
});
