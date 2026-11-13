import Link from "next/link";
import { AuthButton } from "../auth-button";
import { NavbarSearch } from "./NavbarSearch";
import { createClient } from "@/lib/supabase/server";
import { claimsAreAdmin } from "@/lib/admin-access";
import { ThemeSwitcher } from "../theme-switcher";

export const Navbar = async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const showAdmin = claimsAreAdmin(data?.claims);

  return (
    <div className="navbar relative z-20 flex-nowrap gap-3 bg-base-300 px-4 shadow-sm min-h-0">
      <div className="shrink-0">
        <Link className="btn btn-ghost px-2 text-xl" href="/">
          Hortus
        </Link>
      </div>
      <div className="flex min-w-0 flex-1 justify-end">
        <ul className="menu menu-horizontal flex-nowrap items-center gap-1 px-1">
          <li>
            <NavbarSearch />
          </li>
          <li>
            <ThemeSwitcher />
          </li>
          <li>
            <Link href="/my-gardens">Gardens</Link>
          </li>

          {showAdmin ? (
            <li>
              <Link href="/admin">Admin</Link>
            </li>
          ) : null}
          <AuthButton />
        </ul>
      </div>
    </div>
  );
};
