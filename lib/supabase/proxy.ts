import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });
  const authHeaders = new Headers();

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          const previousCookies = supabaseResponse.cookies.getAll();
          supabaseResponse = NextResponse.next({
            request,
          });
          previousCookies.forEach((cookie) => supabaseResponse.cookies.set(cookie));
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([name, value]) =>
            authHeaders.set(name, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const isAuthRoute = request.nextUrl.pathname.startsWith("/auth") || request.nextUrl.pathname.startsWith("/api/auth");
  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");
  const isWorkerRoute = request.nextUrl.pathname.endsWith("-worker");
  const isWebhookRoute = request.nextUrl.pathname.startsWith("/api/workflow") || request.nextUrl.pathname.startsWith("/api/revalidate");
  const isPublicGardenRoute = request.nextUrl.pathname.startsWith("/public/g/");
  const isItemShareRoute =
    request.nextUrl.pathname.startsWith("/s/") ||
    request.nextUrl.pathname.startsWith("/api/share/") ||
    request.nextUrl.pathname === "/api/storage/transfer";

  if (!user && !isAuthRoute && !isLoginRoute && !isWorkerRoute && !isWebhookRoute && !isPublicGardenRoute && !isItemShareRoute && request.nextUrl.pathname !== "/") {
    console.log(`[middleware] Redirecting unauthenticated request to ${request.nextUrl.pathname} to login`);
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    const redirectResponse = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) =>
      redirectResponse.cookies.set(cookie),
    );
    authHeaders.forEach((value, name) => redirectResponse.headers.set(name, value));
    return redirectResponse;
  }

  authHeaders.forEach((value, name) => supabaseResponse.headers.set(name, value));
  return supabaseResponse;
}
