import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthRedirect } from "@/lib/auth-redirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const target = getAuthRedirect(searchParams.get("next"), origin);
  const responseHeaders = new Headers();

  console.log(`[auth-confirm] Received: code=${!!code}, token_hash=${!!token_hash}, type=${type}`);

  const supabase = await createClient(responseHeaders);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(target, { headers: responseHeaders });
    }
    console.error(`[auth-confirm] Code exchange error: ${error.message}`);
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      return NextResponse.redirect(target, { headers: responseHeaders });
    }
    console.error(`[auth-confirm] OTP verification error: ${error.message}`);
  }

  // redirect the user to an error page with some instructions
  console.warn(`[auth-confirm] All verification methods failed. Redirecting to login.`);
  return NextResponse.redirect(new URL("/auth/login?error=CouldNotVerifyLink", origin), {
    headers: responseHeaders,
  });
}
