import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getGardensForUser } from "@/lib/data";
import Link from "next/link";
import { Add, Folder } from "@/components/icons/liquid-glass";
import { GardenCleanupJobs } from "@/components/ui/GardenCleanupJobs";
import { RouteLoading } from "@/components/ui/RouteLoading";
import { getAdminUserId } from "@/lib/admin-access";

export default function AdminGardensPage() {
  return (
    <Suspense fallback={<RouteLoading label="Loading garden administration" />}>
      <AdminGardens />
    </Suspense>
  );
}

async function AdminGardens() {
  const userId = await getAdminUserId();
  if (!userId) redirect("/my-gardens");
  const gardens = await getGardensForUser(userId);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-end mb-8">
        <Link href="/admin/create-garden" className="btn btn-primary btn-sm">
          <Add size={16} /> New Garden
        </Link>
      </div>

      {gardens.length === 0 ? (
        <div className="flex flex-col flex-1 justify-center items-center text-base-content/40 gap-4 min-h-[400px]">
          <Folder size={64} className="opacity-20" />
          <p className="font-semibold text-lg">No gardens yet</p>
          <p className="text-sm">Create your first garden to get started</p>
        </div>
      ) : (
        <div className="max-w-full overflow-x-auto rounded-lg border border-base-content/5">
          <table className="table">
            <thead>
              <tr className="bg-base-200/50">
                <th scope="col">Garden</th>
                <th scope="col">Slug</th>
                <th scope="col">Role</th>
              </tr>
            </thead>
            <tbody>
              {gardens.map((garden) => (
                <tr key={garden.id} className="relative hover:bg-base-200/30">
                  <th scope="row" className="font-medium">
                    <Link
                      href={`/admin/gardens/${garden.slug}`}
                      className="link link-hover after:absolute after:inset-0 after:z-10"
                    >
                      {garden.name}
                    </Link>
                  </th>
                  <td className="font-mono text-sm text-base-content/70">{garden.slug}</td>
                  <td>
                    <span className="badge badge-sm badge-ghost">{garden.role}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Suspense fallback={<RouteLoading label="Loading garden cleanup jobs" />}>
        <GardenCleanupJobs />
      </Suspense>
    </div>
  );
}
