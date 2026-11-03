import { serve } from "@upstash/workflow/nextjs";
import { getAppBaseUrl } from "@/lib/app-url";
import { getRelocationDescendants, relocateStoredItem, replaceStoragePrefix } from "@/lib/storage-relocation";

type RenamePayload = {
  gardenId: string;
  folderId: string;
  oldPrefix: string;
  newPrefix: string;
  newName?: string;
};

export const { POST } = serve<RenamePayload>(async (context) => {
  const { gardenId, folderId, oldPrefix, newPrefix, newName } = context.requestPayload;
  if (oldPrefix === newPrefix) return;

  const descendants = await context.run("prepare-rename", () =>
    getRelocationDescendants(gardenId, folderId, oldPrefix),
  );

  for (let index = 0; index < descendants.length; index += 25) {
    await context.run(`rename-descendants-${index}`, async () => {
      await Promise.all(descendants.slice(index, index + 25).map((entry) =>
        relocateStoredItem(
          entry,
          replaceStoragePrefix(entry.s3_key, oldPrefix, newPrefix),
          entry.thumbnail_key && replaceStoragePrefix(entry.thumbnail_key, oldPrefix, newPrefix),
        ),
      ));
    });
  }

  await context.run("relocate-folder-marker", async () => {
    await relocateStoredItem(
      { id: folderId, s3_key: oldPrefix, thumbnail_key: null },
      newPrefix,
      null,
      { name: newName },
    );
  });

  await context.call("revalidate-cache", {
    url: `${getAppBaseUrl()}/api/revalidate?tag=garden-${gardenId}`,
    method: "POST",
  });
}, {
  failureFunction: async ({ failStatus }) => {
    console.error(`[workflow/rename] Failed (${failStatus})`);
  },
});
