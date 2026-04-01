import Link from "next/link";
import { AuthButton } from "../auth-button";
import { ThemeSwitcher } from "../theme-switcher";

export const Navbar = async () => {
    return <div className="navbar bg-base-300 shadow-sm px-4">
        <div className="flex-1">
            <Link className="btn btn-ghost text-xl" href="/">Hortus</Link>
        </div>
        <div className="flex-none">
            <ul className="menu menu-horizontal px-1">
                <li><Link href="/dashboard">Dashboard</Link></li>
                <AuthButton />
            </ul>
        </div>
    </div>
}