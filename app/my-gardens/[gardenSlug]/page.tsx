import { canHaveThumbnail } from "@/lib/thumbnail-types";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getItems,
  getThumbnailUrls,
  getGardenMembership,
  getGardenBySlug,
  getMoveTreeForUser,
} from "@/lib/data";
import dynamic from "next/dynamic";
import { RouteLoading } from "@/components/ui/RouteLoading";

const DriveExplorer = dynamic(
  () => import("@/components/ui/DriveExplorer").then((m) => m.DriveExplorer),
  {
    loading: () => <RouteLoading label="Loading garden explorer" />,
  }
);

type GardenPageProps = { params: Promise<{ gardenSlug: string }> };

export default function GardenPage({ params }: GardenPageProps) {
  return (
    <Suspense fallback={<RouteLoading label="Loading garden" />}>
      <GardenContents params={params} />
    </Suspense>
  );
}

async function GardenContents({ params }: GardenPageProps) {
  const { gardenSlug } = await params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) return redirect("/auth/login");

  const userId = data.claims.sub as string;

  const garden = await getGardenBySlug(gardenSlug);
  if (!garden) return redirect("/my-gardens");

  // Verify membership
  const membership = await getGardenMembership(garden.id, userId);
  if (!membership) return redirect("/my-gardens");

  // Root folder — no parentId
  const [items, moveTree] = await Promise.all([
    getItems(garden.id, null),
    getMoveTreeForUser(userId),
  ]);

  // Batch-generate thumbnail URLs for image files
  const imageItems = items.filter(
    (i) =>
      i.type === "file" &&
      canHaveThumbnail(i.name)
  );
  const thumbnailUrls =
    imageItems.length > 0
      ? await getThumbnailUrls(garden.id, imageItems.map((i) => i.id))
      : {};

  return (
    <DriveExplorer
      items={items}
      breadcrumbs={[]}
      thumbnailUrls={thumbnailUrls}
      folderId={null}
      gardenId={garden.id}
      gardenSlug={gardenSlug}
      gardenName={garden.name}
      userId={userId}
      canUpload={membership.can_upload}
      canDelete={membership.can_delete}
      moveTree={moveTree}
    />
  );
}
