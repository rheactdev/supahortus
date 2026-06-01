import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/ui/navbar";

export const unstable_instant = false;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) {
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
