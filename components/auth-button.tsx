import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;

  return user ? (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" className="btn btn-ghost btn-sm">
        {user.email}
      </div>
      <ul tabIndex={0} className="dropdown-content menu bg-base-200 rounded-box z-50 w-52 p-2 shadow-lg mt-2">
        <li>
          <LogoutButton />
        </li>
      </ul>
    </div>
  ) : (
    <div className="flex gap-2">
      <Link href="/auth/login" className="btn btn-outline btn-sm">
        Sign in
      </Link>
      <Link href="/auth/sign-up" className="btn btn-primary btn-sm">
        Sign up
      </Link>
    </div>
  );
}
