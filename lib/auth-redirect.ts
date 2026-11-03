export function getAuthRedirect(next: string | null, origin: string): URL {
  const fallback = new URL("/my-gardens", origin);
  if (!next?.startsWith("/") || next.startsWith("//")) return fallback;

  try {
    const target = new URL(next, origin);
    return target.origin === fallback.origin ? target : fallback;
  } catch {
    return fallback;
  }
}
