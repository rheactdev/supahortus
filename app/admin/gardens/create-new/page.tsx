import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CreateGardenDialog } from "@/components/ui/CreateGardenDialog";
import Link from "next/link";

export default async function CreateNewGardenPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) return redirect("/auth/login");

  const userId = data.claims.sub as string;

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
