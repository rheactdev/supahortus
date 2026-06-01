import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CreateGardenDialog } from "@/components/ui/CreateGardenDialog";
import Link from "next/link";

export default async function CreateNewGardenPage() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session?.user || session.user.role !== 'admin') return redirect("/auth/login");

  const userId = session.user.id;

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
        <CreateGardenDialog userId={userId} inline />
      </div>
    </div>
  );
}
