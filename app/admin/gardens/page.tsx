import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getGardensForUser } from "@/lib/data";
import Link from "next/link";
import { Folder } from "@/components/icons/liquid-glass";
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
          + New Garden
        </Link>
      </div>

      {gardens.length === 0 ? (
        <div className="flex flex-col flex-1 justify-center items-center text-base-content/40 gap-4 min-h-[400px]">
          <Folder size={64} className="opacity-20" />
          <p className="font-semibold text-lg">No gardens yet</p>
          <p className="text-sm">Create your first garden to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {gardens.map((garden) => (
            <Link
              key={garden.id}
              href={`/admin/gardens/${garden.slug}`}
              className="card bg-base-200/50 hover:bg-base-300/60 border border-base-content/5 hover:border-primary/30 group active:scale-95"
            >
              <div className="card-body flex flex-col justify-center items-center gap-3">
                <div className="p-3 bg-secondary/10 rounded-lg text-secondary group-hover:bg-secondary group-hover:text-secondary-content">
                  <Folder size={32} className="opacity-80" />
                </div>
                <span className="font-semibold truncate text-sm" title={garden.name}>
                  {garden.name}
                </span>
                <span className="text-xs text-base-content/40 font-mono truncate">
                  {garden.slug}
                </span>
                <span className="badge badge-sm badge-ghost">
                  {garden.role}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <Suspense fallback={<RouteLoading label="Loading garden cleanup jobs" />}>
        <GardenCleanupJobs />
      </Suspense>
    </div>
  );
}
