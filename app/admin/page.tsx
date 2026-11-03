import Link from "next/link";
import { Add, Folder, HardDrive } from "@/components/icons/liquid-glass";
import { AdminStorageActions } from "@/components/ui/AdminStorageActions";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getAdminUserId } from "@/lib/admin-access";
import { RouteLoading } from "@/components/ui/RouteLoading";

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<RouteLoading label="Loading admin dashboard" />}>
      <AdminDashboard />
    </Suspense>
  );
}

async function AdminDashboard() {
  if (!(await getAdminUserId())) redirect("/my-gardens");

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-col items-start gap-5 border-b border-base-content/15 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Admin Dashboard</h1>
          <p className="mt-2 text-base-content/75">Manage gardens, review user accounts, and sync files from S3.</p>
        </div>
        <Link href="/admin/create-garden" className="btn btn-primary shrink-0">
          <span aria-hidden="true"><Add size={20} /></span>
          Create garden
        </Link>
      </header>

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-3 lg:gap-8">
        <nav aria-labelledby="admin-management-heading" className="min-w-0 lg:col-span-2">
          <h2 id="admin-management-heading" className="mb-3 text-lg font-semibold">Management</h2>
          <ul className="list border-y border-base-content/15">
            <li className="list-row items-center px-0">
              <span aria-hidden="true"><Folder size={24} /></span>
              <Link href="/admin/gardens" className="group block min-w-0 rounded-field py-2 focus-visible:outline-2 focus-visible:outline-offset-2">
                <span className="block font-semibold group-hover:underline">Gardens</span>
                <span className="block text-sm text-base-content/75">Browse and manage all gardens.</span>
              </Link>
            </li>

            <li className="list-row items-center px-0">
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              <Link href="/admin/users" className="group block min-w-0 rounded-field py-2 focus-visible:outline-2 focus-visible:outline-offset-2">
                <span className="block font-semibold group-hover:underline">Users</span>
                <span className="block text-sm text-base-content/75">Review registered accounts and sign-in details.</span>
              </Link>
            </li>
          </ul>
        </nav>

        <section aria-labelledby="admin-storage-heading" className="card card-border min-w-0 bg-base-200">
          <div className="card-body gap-3">
            <h2 id="admin-storage-heading" className="card-title">
              <span aria-hidden="true"><HardDrive size={24} /></span>
              Storage
            </h2>
            <p className="text-base-content/75">Scan S3 for files and register new items.</p>
            <div className="card-actions mt-2 min-w-0 wrap-anywhere">
              <AdminStorageActions />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
