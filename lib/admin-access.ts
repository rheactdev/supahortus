import "server-only";

import { createClient } from "@/lib/supabase/server";

type Claims = {
  sub?: unknown;
  app_metadata?: unknown;
};

function configuredAdminIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function claimsAreAdmin(claims: unknown): boolean {
  if (!claims || typeof claims !== "object") return false;

  const { sub, app_metadata: appMetadata } = claims as Claims;
  if (typeof sub === "string" && configuredAdminIds().has(sub)) {
    return true;
  }

  if (!appMetadata || typeof appMetadata !== "object") return false;

  const metadata = appMetadata as Record<string, unknown>;
  return metadata.role === "admin" || metadata.is_admin === true;
}

export async function getAdminUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!claimsAreAdmin(data?.claims)) return null;

  const userId = data?.claims?.sub;
  return typeof userId === "string" ? userId : null;
}

export async function requireAdmin(): Promise<string> {
  const userId = await getAdminUserId();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}
