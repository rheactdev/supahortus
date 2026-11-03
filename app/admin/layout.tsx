import { redirect } from "next/navigation";
import { Navbar } from "@/components/ui/navbar";
import { getAdminUserId } from "@/lib/admin-access";
import { Suspense, type ReactNode } from "react";
import { RouteLoading } from "@/components/ui/RouteLoading";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<RouteLoading label="Loading admin dashboard" />}>
      <AdminLayout>{children}</AdminLayout>
    </Suspense>
  );
}

async function AdminLayout({ children }: { children: ReactNode }) {
  const adminUserId = await getAdminUserId();
  if (!adminUserId) {
    redirect("/my-gardens");
  }

  return (
    <div className="min-h-screen bg-base-100 flex flex-col text-base-content antialiased selection:bg-primary selection:text-primary-content">
      <Navbar />
      <main className="flex-1 w-full p-8 pt-6 mx-auto flex flex-col gap-6 h-auto">
        {children}
      </main>
    </div>
  );
}
