import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { LogoutButton } from "./logout-button";

export async function AuthButton() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  const user = session?.user;
  if (!user) {
    return null
  }

  return (
    <li>
      <details className="">
        <summary tabIndex={0}>{user.email}</summary>
        <ul tabIndex={-1} className="bg-base-300 rounded-t-none p-2 right-0">
          <li><LogoutButton /></li>
        </ul>
      </details>
    </li>
  )
}
