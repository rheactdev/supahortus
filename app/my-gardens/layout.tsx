import { Suspense, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/ui/navbar";

export const unstable_instant = false;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center"
          role="status"
          aria-label="Loading dashboard"
        >
          <span className="loading loading-rings loading-lg" />
        </div>
      }
    >
      <AuthenticatedDashboard>{children}</AuthenticatedDashboard>
    </Suspense>
  );
}

async function AuthenticatedDashboard({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    return redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-base-100 flex flex-col text-base-content antialiased selection:bg-primary selection:text-primary-content">
      <Navbar />
      <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-8 flex flex-col gap-6 h-auto">
        {children}
      </main>
    </div>
  );
}
