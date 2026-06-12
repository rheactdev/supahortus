import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;
  if (!user) {
    return null
  }

  return (
    <li className="shrink-0 whitespace-nowrap">
      <details className="">
        <summary tabIndex={0} className="whitespace-nowrap">{user.email}</summary>
        <ul tabIndex={-1} className="bg-base-300 rounded-t-none p-2 right-0">
          <li><LogoutButton /></li>
        </ul>
      </details>
    </li>
  )
}
