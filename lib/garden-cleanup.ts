import "server-only";

import { Client } from "@upstash/workflow";
import { getAppBaseUrl } from "@/lib/app-url";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function recordGardenCleanupFailure(gardenId: string, message: string) {
  const { error } = await supabaseAdmin
    .from("garden_deletions")
    .update({ last_error: message })
    .eq("garden_id", gardenId)
    .is("completed_at", null);
  if (error) throw error;
}

export async function enqueueGardenCleanup(gardenId: string) {
  try {
    const { data: job, error } = await supabaseAdmin
      .from("garden_deletions")
      .update({ last_error: null })
      .eq("garden_id", gardenId)
      .is("completed_at", null)
      .select("garden_id")
      .maybeSingle();
    if (error) throw error;
    if (!job) return;

    const workflow = new Client({ token: process.env.QSTASH_TOKEN! });
    await workflow.trigger({
      url: `${getAppBaseUrl()}/api/workflow/delete-garden`,
      body: { gardenId },
      retries: 3,
    });
  } catch (error) {
    console.error("[garden-cleanup] Could not queue cleanup", error);
    try {
      await recordGardenCleanupFailure(gardenId, "Could not queue storage cleanup");
    } catch (recordError) {
      console.error("[garden-cleanup] Could not record queue failure", recordError);
    }
  }
}
