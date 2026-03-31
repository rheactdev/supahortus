import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  console.log(`[auth-confirm] Received: code=${!!code}, token_hash=${!!token_hash}, type=${type}, next=${next}`);

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      console.log(`[auth-confirm] Successfully exchanged code for session. Redirecting to ${next}`);
      return redirect(next);
    }
    console.error(`[auth-confirm] Code exchange error: ${error.message}`);
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (!error) {
      console.log(`[auth-confirm] Successfully verified OTP. Redirecting to ${next}`);
      return redirect(next);
    }
    console.error(`[auth-confirm] OTP verification error: ${error.message}`);
  }

  // redirect the user to an error page with some instructions
  console.warn(`[auth-confirm] All verification methods failed. Redirecting to login.`);
  return redirect(`/auth/login?error=CouldNotVerifyLink`);
}
