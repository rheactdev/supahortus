import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getGardenStoragePrefix(gardenId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("gardens")
    .select("storage_prefix")
    .eq("id", gardenId)
    .single();

  if (error || !data) throw new Error("Garden not found");
  return data.storage_prefix;
}
