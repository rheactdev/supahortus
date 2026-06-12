"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPublicGardenContext } from "@/lib/public-garden";

export async function redeemPublicGardenLink(token: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;

  if (!userId) throw new Error("Anonymous sign-in is required");

  const context = await getPublicGardenContext(token);
  if (!context) throw new Error("This public link is invalid or disabled");

  const { error } = await supabaseAdmin
    .from("garden_public_visitors")
    .upsert(
      {
        public_link_id: context.link.id,
        user_id: userId,
      },
      { onConflict: "public_link_id,user_id" },
    );

  if (error) throw error;
  updateTag(`garden-${context.garden.id}`);
}
