import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminStorageActions } from "@/components/ui/AdminStorageActions";
import { RouteLoading } from "@/components/ui/RouteLoading";
import { getAdminUserId } from "@/lib/admin-access";

export default function AdminActionsPage() {
  return (
    <Suspense fallback={<RouteLoading label="Loading admin actions" />}>
      <AdminActions />
    </Suspense>
  );
}

async function AdminActions() {
  if (!(await getAdminUserId())) redirect("/my-gardens");

  return (
    <AdminStorageActions />
  );
}
