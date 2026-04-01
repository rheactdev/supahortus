import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getItems, getBreadcrumbs, getThumbnailUrls } from "@/lib/data";
import { DriveExplorer } from "@/components/ui/DriveExplorer";
import { connection } from "next/server";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  await connection();
  const { folder: folderId = null } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const isAdmin = user.app_metadata?.role === "admin";

  // These calls are cached by "use cache" in the data functions
  // Cache key includes userId + folderId, so each user sees their own data
  const items = await getItems(user.id, folderId);
  const breadcrumbs = await getBreadcrumbs(folderId);

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
          userId={user.id}
          isAdmin={isAdmin}
        />
      </Suspense>
    </div>
  );
}
