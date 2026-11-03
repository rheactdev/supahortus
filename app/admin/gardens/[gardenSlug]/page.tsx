import { Suspense } from "react";
import { getAdminUserId } from "@/lib/admin-access";
import { RouteLoading } from "@/components/ui/RouteLoading";
import { redirect } from "next/navigation";
import {
  getGardenBySlug,
  getGardenMembership,
  getGardenMembers,
  getGardenPublicLink,
} from "@/lib/data";
import { GardenDangerZone, GardenSettings } from "@/components/ui/GardenSettings";
import { MemberManager } from "@/components/ui/MemberManager";
import { getGardenStoragePrefix } from "@/lib/garden-storage";
import Link from "next/link";
import { ArrowLeft } from "@/components/icons/liquid-glass";

type SettingsPageProps = { params: Promise<{ gardenSlug: string }> };

export default function SettingsPage({ params }: SettingsPageProps) {
  return (
    <Suspense fallback={<RouteLoading label="Loading garden settings" />}>
      <GardenSettingsContents params={params} />
    </Suspense>
  );
}

async function GardenSettingsContents({ params }: SettingsPageProps) {
  const userId = await getAdminUserId();
  if (!userId) redirect("/my-gardens");
  const { gardenSlug } = await params;

  const garden = await getGardenBySlug(gardenSlug);
  if (!garden) return redirect("/admin/gardens");

  const membership = await getGardenMembership(garden.id, userId);
  if (!membership || membership.role !== "owner") {
    return redirect("/my-gardens");
  }

  const [members, publicLink, storagePrefix] = await Promise.all([
    getGardenMembers(garden.id),
    getGardenPublicLink(garden.id),
    getGardenStoragePrefix(garden.id),
  ]);

  return (
    <div className="w-full min-w-0 max-w-5xl">
      <Link className="btn" href="/admin/gardens"><ArrowLeft size={16} />
        Back</Link>
      <GardenSettings garden={garden} userId={userId} storagePrefix={storagePrefix} />
      <MemberManager
        gardenId={garden.id}
        members={members}
        userId={userId}
        gardenName={garden.name}
        publicLink={publicLink}
      />
      <GardenDangerZone garden={garden} userId={userId} />
    </div>
  );
}
