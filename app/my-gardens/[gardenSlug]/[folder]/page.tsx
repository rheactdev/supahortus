import { canHaveThumbnail } from "@/lib/thumbnail-types";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getItems,
  getBreadcrumbs,
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

type FolderPageProps = { params: Promise<{ gardenSlug: string; folder: string }> };

export default function FolderPage({ params }: FolderPageProps) {
  return (
    <Suspense fallback={<RouteLoading label="Loading folder" />}>
      <FolderContents params={params} />
    </Suspense>
  );
}

async function FolderContents({ params }: FolderPageProps) {
  const { gardenSlug, folder: folderId } = await params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) return redirect("/auth/login");

  const userId = data.claims.sub as string;

  const garden = await getGardenBySlug(gardenSlug);
  if (!garden) return redirect("/my-gardens");

  // Verify membership
  const membership = await getGardenMembership(garden.id, userId);
  if (!membership) return redirect("/my-gardens");

  // Parallel data fetching
  const [items, breadcrumbs, moveTree] = await Promise.all([
    getItems(garden.id, folderId),
    getBreadcrumbs(garden.id, folderId),
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
      breadcrumbs={breadcrumbs}
      thumbnailUrls={thumbnailUrls}
      folderId={folderId}
      gardenId={garden.id}
      gardenSlug={gardenSlug}
      userId={userId}
      canUpload={membership.can_upload}
      canDelete={membership.can_delete}
      moveTree={moveTree}
    />
  );
}
