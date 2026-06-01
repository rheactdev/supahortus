import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  getItems,
  getThumbnailUrls,
  getGardenMembership,
  getGardenBySlug,
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
}: {
  params: Promise<{ gardenSlug: string }>;
}) {
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
  const items = await getItems(garden.id, null);

  // Batch-generate thumbnail URLs for image files
  const imageItems = items.filter(
    (i) =>
      i.type === "file" &&
      /\.(jpg|jpeg|png|gif|webp|svg|avif|psd|afdesign|afphoto|afpub|af)$/i.test(i.name)
  );
  const thumbnailUrls =
    imageItems.length > 0
      ? await getThumbnailUrls(garden.id, imageItems.map((i) => i.id))
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
        breadcrumbs={[]}
        thumbnailUrls={thumbnailUrls}
        folderId={null}
        gardenId={garden.id}
        gardenSlug={gardenSlug}
        userId={userId}
        canUpload={membership.can_upload}
        canDelete={membership.can_delete}
        role={membership.role}
      />
    </Suspense>
  );
}
