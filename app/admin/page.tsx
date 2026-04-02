import Link from "next/link";
import { Folder } from "@/components/icons/liquid-glass";

export default async function AdminDashboardPage() {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <p className="text-base-content/60 mt-1">
          Manage your gardens and users.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <Link
          href="/admin/gardens"
          className="card bg-base-200/50 hover:bg-base-300/60 border border-base-content/5 hover:border-primary/30 group active:scale-95"
        >
          <div className="card-body flex flex-col justify-center items-center gap-3">
            <div className="p-3 bg-secondary/10 rounded-lg text-secondary group-hover:bg-secondary group-hover:text-secondary-content">
              <Folder size={32} className="opacity-80" />
            </div>
            <span className="font-semibold text-sm">Gardens</span>
            <span className="text-xs text-base-content/40">Manage all gardens</span>
          </div>
        </Link>

        <Link
          href="/admin/users"
          className="card bg-base-200/50 hover:bg-base-300/60 border border-base-content/5 hover:border-primary/30 group active:scale-95"
        >
          <div className="card-body flex flex-col justify-center items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-lg text-primary group-hover:bg-primary group-hover:text-primary-content">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 opacity-80">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
            </div>
            <span className="font-semibold text-sm">Users</span>
            <span className="text-xs text-base-content/40">Manage users</span>
          </div>
        </Link>
      </div>
    </div>
  );
}
