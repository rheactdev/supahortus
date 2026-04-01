import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getItems, getBreadcrumbs, getThumbnailUrls } from "@/lib/data";
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const { folder: folderId = null } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) return null;

  const userId = data.claims.sub as string;
  const isAdmin = (data.claims as Record<string, unknown>).app_metadata
    ? ((data.claims as Record<string, unknown>).app_metadata as Record<string, unknown>)?.role === "admin"
    : false;

  // Parallel data fetching — items + breadcrumbs fire at the same time
  const [items, breadcrumbs] = await Promise.all([
    getItems(userId, folderId),
    getBreadcrumbs(folderId),
  ]);

  // Batch-generate thumbnail URLs for image files (1 call instead of N)
  const imageItems = items.filter(
    (i) =>
      i.size !== null &&
      /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(i.name)
  );
  const thumbnailUrls =
    imageItems.length > 0
      ? await getThumbnailUrls(imageItems.map((i) => i.id))
      : {};

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Your Drive</h1>
          <p className="text-base-content/60 mt-1">
            Manage and access all your files safely stored in B2.
          </p>
        </div>
      </div>
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
          userId={userId}
          isAdmin={isAdmin}
        />
      </Suspense>
    </div>
  );
}
