"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function redeemPublicGardenLink(token: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;

  if (!userId) throw new Error("Anonymous sign-in is required");

  const { data: gardenId, error } = await supabaseAdmin.rpc("redeem_garden_public_link", {
    p_token: token,
    p_user_id: userId,
  });

  if (error) throw error;
  if (!gardenId) throw new Error("This public link is invalid or disabled");
  updateTag(`garden-${gardenId}`);
}
