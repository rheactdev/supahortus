import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getGardenBySlug,
  getGardenMembership,
  getGardenMembers,
} from "@/lib/data";
import { GardenSettings } from "@/components/ui/GardenSettings";
import { MemberManager } from "@/components/ui/MemberManager";
import Link from "next/link";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ gardenSlug: string }>;
}) {
  const { gardenSlug } = await params;

  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session?.user || session.user.role !== 'admin') return redirect("/auth/login");

  const userId = data.claims.sub as string;

  const garden = await getGardenBySlug(gardenSlug);
  if (!garden) return redirect("/admin/gardens");

  const membership = await getGardenMembership(garden.id, userId);
  if (!membership || membership.role !== "owner") {
    return redirect("/my-gardens");
  }

  const members = await getGardenMembers(garden.id);

  return (
    <div className="flex flex-col gap-8 w-full">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/gardens"
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
        gardenId={garden.id}
        members={members}
        userId={userId}
        gardenName={garden.name}
      />
    </div>
  );
}