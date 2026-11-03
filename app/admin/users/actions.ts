"use server";

import { revalidatePath } from "next/cache";
import { getAdminUserId, userIsAdmin } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function deleteAdminTableUser(userId: string): Promise<string | null> {
  const adminUserId = await getAdminUserId();
  if (!adminUserId) return "You must be an admin to delete users.";
  if (userId === adminUserId) return "Admin accounts cannot be deleted.";

  const { data: caller, error: callerError } = await supabaseAdmin.auth.admin.getUserById(adminUserId);
  if (callerError || !caller.user || !userIsAdmin(caller.user)) {
    return "Could not verify your admin access.";
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error?.code === "user_not_found") {
    revalidatePath("/admin/users");
    return null;
  }
  if (error || !data.user) return "Could not look up this user.";
  if (userIsAdmin(data.user)) return "Admin accounts cannot be deleted.";

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteError && deleteError.code !== "user_not_found") {
    return "Could not delete this user. Please try again.";
  }

  revalidatePath("/admin/users");
  return null;
}
