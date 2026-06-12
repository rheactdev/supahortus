import { supabaseAdmin } from "@/lib/supabase/admin";

export type GardenAccess = {
  can_upload: boolean;
  can_delete: boolean;
  role: "owner" | "member" | "public";
};

export async function getGardenAccessForUser(
  gardenId: string,
  userId: string,
): Promise<GardenAccess | null> {
  const { data: membership } = await supabaseAdmin
    .from("garden_members")
    .select("can_upload, can_delete, role")
    .eq("garden_id", gardenId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membership) {
    return membership as GardenAccess;
  }

  const { data: publicLink } = await supabaseAdmin
    .from("garden_public_links")
    .select("id, can_upload, can_delete")
    .eq("garden_id", gardenId)
    .eq("enabled", true)
    .maybeSingle();

  if (!publicLink) return null;

  const { data: visitor } = await supabaseAdmin
    .from("garden_public_visitors")
    .select("user_id")
    .eq("public_link_id", publicLink.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!visitor) return null;

  return {
    can_upload: publicLink.can_upload,
    can_delete: publicLink.can_delete,
    role: "public",
  };
}
