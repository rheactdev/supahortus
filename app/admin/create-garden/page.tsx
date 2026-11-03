import { Suspense } from "react";
import { getAdminUserId } from "@/lib/admin-access";
import { redirect } from "next/navigation";
import { CreateGardenDialog } from "@/components/ui/CreateGardenDialog";
import { RouteLoading } from "@/components/ui/RouteLoading";
import Link from "next/link";

export default function CreateNewGardenPage() {
  return (
    <Suspense fallback={<RouteLoading label="Loading garden creation" />}>
      <CreateNewGarden />
    </Suspense>
  );
}

async function CreateNewGarden() {
  if (!(await getAdminUserId())) redirect("/my-gardens");

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/admin/gardens" className="btn btn-ghost btn-sm">
          ← Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create New Garden</h1>
          <p className="text-base-content/60 text-sm mt-0.5">
            Set up a new garden for your team.
          </p>
        </div>
      </div>

      <div className="max-w-md">
        <CreateGardenDialog inline />
      </div>
    </div>
  );
}
