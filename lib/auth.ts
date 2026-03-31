import { SupabaseClient } from "@supabase/supabase-js";

type User = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
};

type AccessResult = {
  allowed: boolean;
  isAdmin: boolean;
};

/**
 * Check if a user has access to a given S3 key/prefix.
 * - Admins (app_metadata.role === "admin") get instant full access.
 * - Non-admins are checked against folder_shares for their email.
 */
export async function checkAccess(
  supabase: SupabaseClient,
  user: User,
  keyOrPrefix: string
): Promise<AccessResult> {
  const isAdmin = user.app_metadata?.role === "admin";

  if (isAdmin) {
    return { allowed: true, isAdmin: true };
  }

  if (!user.email) {
    return { allowed: false, isAdmin: false };
  }

  // Query all folder shares for this user's email
  const { data: shares, error } = await supabase
    .from("folder_shares")
    .select("folder_prefix")
    .eq("user_email", user.email);

  if (error || !shares || shares.length === 0) {
    return { allowed: false, isAdmin: false };
  }

  // Check if the requested key starts with any of the user's shared prefixes
  const allowed = shares.some((share) => keyOrPrefix.startsWith(share.folder_prefix));

  return { allowed, isAdmin: false };
}

/**
 * Get the list of shared folder prefixes for a non-admin user.
 * Used when a non-admin views the root directory.
 */
export async function getSharedPrefixes(
  supabase: SupabaseClient,
  userEmail: string
): Promise<string[]> {
  const { data: shares, error } = await supabase
    .from("folder_shares")
    .select("folder_prefix")
    .eq("user_email", userEmail);

  if (error || !shares) return [];
  return shares.map((s) => s.folder_prefix);
}
