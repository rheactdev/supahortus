import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getItems,
  getBreadcrumbs,
  getThumbnailUrls,
  getGardenMembership,
} from "@/lib/data";
import dynamic from "next/dynamic";

const DriveExplorer = dynamic(
  () => import("@/components/ui/DriveExplorer").then((m) => m.DriveExplorer),
  {
    loading: () => (
      <div className="flex justify-center p-12">
        <span className="loading loading-ring text-primary loading-lg" />
      </div>
    ),
  }
);

export default async function GardenPage({
  params,
  searchParams,
}: {
  params: Promise<{ gardenId: string }>;
  searchParams: Promise<{ folder?: string }>;
}) {
  const { gardenId } = await params;
  const { folder: folderId = null } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) return redirect("/auth/login");

  const userId = data.claims.sub as string;

  // Verify membership
  const membership = await getGardenMembership(gardenId, userId);
  if (!membership) return redirect("/dashboard");

  // Parallel data fetching
  const [items, breadcrumbs] = await Promise.all([
    getItems(gardenId, folderId),
    getBreadcrumbs(folderId),
  ]);

  // Batch-generate thumbnail URLs for image files
  const imageItems = items.filter(
    (i) =>
      i.type === "file" &&
      /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(i.name)
  );
  const thumbnailUrls =
    imageItems.length > 0
      ? await getThumbnailUrls(gardenId, imageItems.map((i) => i.id))
      : {};

  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-12">
          <span className="loading loading-ring text-primary loading-lg" />
        </div>
      }
    >
      <DriveExplorer
        items={items}
        breadcrumbs={breadcrumbs}
        thumbnailUrls={thumbnailUrls}
        folderId={folderId}
        gardenId={gardenId}
        userId={userId}
        canUpload={membership.can_upload}
        canDelete={membership.can_delete}
        role={membership.role}
      />
    </Suspense>
  );
}
