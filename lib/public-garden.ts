import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Garden, GardenPublicLink } from "@/lib/data";

export type PublicGardenContext = {
  garden: Garden;
  link: GardenPublicLink;
  isRedeemed: boolean;
};

export async function getPublicGardenContext(
  token: string,
  userId?: string,
): Promise<PublicGardenContext | null> {
  const { data: link } = await supabaseAdmin
    .from("garden_public_links")
    .select(
      "id, garden_id, token, enabled, can_upload, can_delete, created_by, created_at, updated_at",
    )
    .eq("token", token)
    .eq("enabled", true)
    .maybeSingle();

  if (!link) return null;

  const { data: garden } = await supabaseAdmin
    .from("gardens")
    .select("id, slug, name, created_by, created_at")
    .eq("id", link.garden_id)
    .maybeSingle();

  if (!garden) return null;

  let isRedeemed = false;
  if (userId) {
    const { data: visitor } = await supabaseAdmin
      .from("garden_public_visitors")
      .select("user_id")
      .eq("public_link_id", link.id)
      .eq("user_id", userId)
      .maybeSingle();
    isRedeemed = Boolean(visitor);
  }

  return {
    garden: garden as Garden,
    link: link as GardenPublicLink,
    isRedeemed,
  };
}
