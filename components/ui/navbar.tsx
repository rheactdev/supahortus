import Link from "next/link";

export const Navbar = () => {
    return <div className="navbar bg-base-300 shadow-sm">
        <div className="flex-1">
            <Link className="btn btn-ghost text-xl" href="/">Hortus</Link>
        </div>
        <div className="flex-none">
            <ul className="menu menu-horizontal px-1">
                <li><Link href="/dashboard">Dashboard</Link></li>
            </ul>
        </div>
    </div>
}