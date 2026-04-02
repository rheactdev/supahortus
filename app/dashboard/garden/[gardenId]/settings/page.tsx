import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getGarden,
  getGardenMembership,
  getGardenMembers,
} from "@/lib/data";
import { GardenSettings } from "@/components/ui/GardenSettings";
import { MemberManager } from "@/components/ui/MemberManager";
import Link from "next/link";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ gardenId: string }>;
}) {
  const { gardenId } = await params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) return redirect("/auth/login");

  const userId = data.claims.sub as string;

  const membership = await getGardenMembership(gardenId, userId);
  if (!membership || membership.role !== "owner") {
    return redirect(`/dashboard/garden/${gardenId}`);
  }

  const [garden, members] = await Promise.all([
    getGarden(gardenId),
    getGardenMembers(gardenId),
  ]);

  if (!garden) return redirect("/dashboard");

  return (
    <div className="flex flex-col gap-8 w-full">
      <div className="flex items-center gap-4">
        <Link
          href={`/dashboard/garden/${gardenId}`}
          className="btn btn-ghost btn-sm"
        >
          ← Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Garden Settings
          </h1>
          <p className="text-base-content/60 text-sm mt-0.5">
            Manage <span className="font-medium">{garden.name}</span>
          </p>
        </div>
      </div>

      <GardenSettings garden={garden} userId={userId} />

      <div className="divider" />

      <MemberManager
        gardenId={gardenId}
        members={members}
        userId={userId}
        gardenName={garden.name}
      />
    </div>
  );
}
