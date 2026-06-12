import { serve } from "@upstash/workflow/nextjs";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppBaseUrl } from "@/lib/app-url";

type MoveFilesPayload = {
  sourceGardenId: string;
  targetGardenId: string;
  targetParentId: string | null;
  targetParentS3Key: string;
  itemIds: string[];
};

type FileMove = {
  id: string;
  oldS3Key: string;
  newS3Key: string;
  oldThumbnailKey: string | null;
  newThumbnailKey: string | null;
};

function encodeCopySource(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export const { POST } = serve<MoveFilesPayload>(
  async (context) => {
    const {
      sourceGardenId,
      targetGardenId,
      targetParentId,
      targetParentS3Key,
      itemIds,
    } = context.requestPayload;

    const moves = await context.run("prepare-file-moves", async () => {
      const { data, error } = await supabaseAdmin
        .from("items")
        .select("id, name, s3_key, thumbnail_key, garden_id, type")
        .in("id", itemIds);

      if (error) throw error;
      if (!data || data.length !== itemIds.length) {
        throw new Error("One or more files could not be found");
      }
      if (
        data.some(
          (item) =>
            item.type !== "file" || item.garden_id !== sourceGardenId,
        )
      ) {
        throw new Error("Only files from the source garden can be moved");
      }

      let conflictQuery = supabaseAdmin
        .from("items")
        .select("name")
        .eq("garden_id", targetGardenId)
        .in(
          "name",
          data.map((item) => item.name),
        );

      conflictQuery = targetParentId
        ? conflictQuery.eq("parent_id", targetParentId)
        : conflictQuery.is("parent_id", null);

      const { data: conflicts, error: conflictError } =
        await conflictQuery;
      if (conflictError) throw conflictError;
      if (conflicts?.length) {
        throw new Error(
          `Destination already contains: ${conflicts
            .map((item) => item.name)
            .join(", ")}`,
        );
      }

      const prepared: FileMove[] = data.map((item) => {
        const newS3Key = `${targetParentS3Key}${item.name}`;
        return {
          id: item.id,
          oldS3Key: item.s3_key,
          newS3Key,
          oldThumbnailKey: item.thumbnail_key,
          newThumbnailKey: item.thumbnail_key
            ? newS3Key.replace(/\.[^/.]+$/, "") + "_thumb.webp"
            : null,
        };
      });

      return prepared;
    });

    await context.run("copy-file-objects", async () => {
      await Promise.all(
        moves.flatMap((move) => {
          const copies = [
            s3Client.send(
              new CopyObjectCommand({
                Bucket: BUCKET_NAME,
                CopySource: `${BUCKET_NAME}/${encodeCopySource(move.oldS3Key)}`,
                Key: move.newS3Key,
              }),
            ),
          ];

          if (move.oldThumbnailKey && move.newThumbnailKey) {
            copies.push(
              s3Client.send(
                new CopyObjectCommand({
                  Bucket: BUCKET_NAME,
                  CopySource: `${BUCKET_NAME}/${encodeCopySource(move.oldThumbnailKey)}`,
                  Key: move.newThumbnailKey,
                }),
              ),
            );
          }

          return copies;
        }),
      );
    });

    await context.run("update-file-records", async () => {
      for (const move of moves) {
        const { error } = await supabaseAdmin.rpc(
          "internal_move_file_record",
          {
            p_item_id: move.id,
            p_target_garden_id: targetGardenId,
            p_target_parent_id: targetParentId,
            p_new_s3_key: move.newS3Key,
            p_new_thumbnail_key: move.newThumbnailKey,
          },
        );
        if (error) throw error;
      }
    });

    await context.run("delete-old-file-objects", async () => {
      const oldKeys = moves.flatMap((move) => [
        move.oldS3Key,
        ...(move.oldThumbnailKey ? [move.oldThumbnailKey] : []),
      ]);

      for (let index = 0; index < oldKeys.length; index += 1000) {
        const batch = oldKeys.slice(index, index + 1000);
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: { Objects: batch.map((Key) => ({ Key })) },
          }),
        );
      }
    });

    await context.call("revalidate-source-garden", {
      url: `${getAppBaseUrl()}/api/revalidate?tag=garden-${sourceGardenId}`,
      method: "POST",
    });

    if (targetGardenId !== sourceGardenId) {
      await context.call("revalidate-target-garden", {
        url: `${getAppBaseUrl()}/api/revalidate?tag=garden-${targetGardenId}`,
        method: "POST",
      });
    }
  },
  {
    failureFunction: async ({ failStatus, failResponse }) => {
      console.error(
        `[workflow/move-files] Failed (${failStatus}):`,
        failResponse,
      );
    },
  },
);
