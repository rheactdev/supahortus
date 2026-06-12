import { supabaseAdmin } from "@/lib/supabase/admin";
import { getGardenAccessForUser } from "@/lib/garden-access";

export async function requireGardenPermission(
  gardenId: string,
  userId: string,
  permission: "read" | "upload" | "delete",
) {
  const access = await getGardenAccessForUser(gardenId, userId);
  if (!access) throw new Error("No access to this garden");
  if (permission === "upload" && !access.can_upload) {
    throw new Error("No upload permission");
  }
  if (permission === "delete" && !access.can_delete) {
    throw new Error("No delete permission");
  }
  return access;
}

export async function requirePendingUpload(
  itemId: string,
  key: string,
  userId: string,
) {
  const { data: item } = await supabaseAdmin
    .from("items")
    .select("id, garden_id, s3_key, status")
    .eq("id", itemId)
    .eq("s3_key", key)
    .eq("status", "pending")
    .maybeSingle();

  if (!item) throw new Error("Pending upload not found");
  await requireGardenPermission(item.garden_id, userId, "upload");
  return item;
}
