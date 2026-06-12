import { createClient } from "@/lib/supabase/server";
import {
  getBreadcrumbs,
  getItems,
  getThumbnailUrls,
} from "@/lib/data";
import { getPublicGardenContext } from "@/lib/public-garden";
import { PublicGardenBootstrap } from "@/components/ui/PublicGardenBootstrap";
import { DriveExplorer } from "@/components/ui/DriveExplorer";
import { connection } from "next/server";

export async function PublicGarden({
  token,
  folderId,
}: {
  token: string;
  folderId: string | null;
}) {
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  const context = await getPublicGardenContext(token, userId);

  if (!context) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-xl font-bold">Public link unavailable</h1>
          <p className="text-sm text-base-content/60 mt-2">
            This link is invalid or has been disabled.
          </p>
        </div>
      </div>
    );
  }

  if (!userId || !context.isRedeemed) {
    return <PublicGardenBootstrap token={token} />;
  }

  const [items, breadcrumbs] = await Promise.all([
    getItems(context.garden.id, folderId),
    getBreadcrumbs(context.garden.id, folderId),
  ]);
  const imageItems = items.filter(
    (item) =>
      item.type === "file" &&
      /\.(jpg|jpeg|png|gif|webp|svg|avif|psd|afdesign|afphoto|afpub|af)$/i.test(
        item.name,
      ),
  );
  const thumbnailUrls =
    imageItems.length > 0
      ? await getThumbnailUrls(
          context.garden.id,
          imageItems.map((item) => item.id),
        )
      : {};
  const basePath = `/public/g/${token}`;

  return (
    <div className="min-h-screen bg-base-100 text-base-content">
      <header className="border-b border-base-content/10 px-4 py-3 md:px-8">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-bold truncate">{context.garden.name}</h1>
            <p className="text-xs text-base-content/50">Public garden</p>
          </div>
          <span className="badge badge-ghost shrink-0">Public</span>
        </div>
      </header>
      <DriveExplorer
        items={items}
        breadcrumbs={breadcrumbs}
        thumbnailUrls={thumbnailUrls}
        folderId={folderId}
        gardenId={context.garden.id}
        gardenSlug={context.garden.slug}
        userId={userId}
        canUpload={context.link.can_upload}
        canDelete={context.link.can_delete}
        basePath={basePath}
        allowShareLinks={false}
      />
    </div>
  );
}
