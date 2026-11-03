import { Suspense } from "react";
import { redirect } from "next/navigation";
import { RouteLoading } from "@/components/ui/RouteLoading";
import { getAdminUserId } from "@/lib/admin-access";

export default function AdminPage() {
  return (
    <Suspense fallback={<RouteLoading label="Loading admin dashboard" />}>
      <AdminRedirect />
    </Suspense>
  );
}

async function AdminRedirect() {
  if (!(await getAdminUserId())) redirect("/my-gardens");

  redirect("/admin/gardens");
}
