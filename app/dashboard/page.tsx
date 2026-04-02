import { createClient } from "@/lib/supabase/server";
import { getGardensForUser } from "@/lib/data";
import Link from "next/link";
import { Folder } from "@/components/icons/liquid-glass";
import { CreateGardenDialog } from "@/components/ui/CreateGardenDialog";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) return null;

  const userId = data.claims.sub as string;
  const gardens = await getGardensForUser(userId);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your Gardens</h1>
          <p className="text-base-content/60 mt-1">
            Select a garden to browse files, or create a new one.
          </p>
        </div>
        <CreateGardenDialog userId={userId} />
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
              href={`/dashboard/garden/${garden.id}`}
              className="card bg-base-200/50 hover:bg-base-300/60 border border-base-content/5 hover:border-primary/30 group active:scale-95"
            >
              <div className="card-body flex flex-col justify-center items-center gap-3">
                <div className="p-3 bg-secondary/10 rounded-lg text-secondary group-hover:bg-secondary group-hover:text-secondary-content">
                  <Folder size={32} className="opacity-80" />
                </div>
                <span className="font-semibold truncate text-sm" title={garden.name}>
                  {garden.name}
                </span>
                <span className="badge badge-sm badge-ghost">
                  {garden.role}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
