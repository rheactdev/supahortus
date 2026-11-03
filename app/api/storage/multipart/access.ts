import { requireGardenPermission, requirePendingUpload } from "@/lib/storage-access";
import { readUploadTicket } from "@/lib/upload-ticket";

export async function requireMultipartUpload(
  uploadToken: unknown,
  itemId: unknown,
  key: string,
  uploadId: string,
  userId: string,
) {
  if (uploadToken == null && typeof itemId === "string" && itemId) {
    await requirePendingUpload(itemId, key, userId);
    return { legacyItemId: itemId };
  }

  const ticket = readUploadTicket(uploadToken, userId);
  if (!ticket || ticket.key !== key || ticket.uploadId !== uploadId) {
    throw new Error("Invalid multipart upload ticket");
  }

  await requireGardenPermission(ticket.gardenId, userId, "upload");
  return { legacyItemId: null };
}
