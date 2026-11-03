import { Suspense } from "react";
import { RouteLoading } from "@/components/ui/RouteLoading";
import { StorageDownloadLink } from "@/components/ui/StorageDownloadLink";
import { STORAGE_TRANSFER_PATH } from "@/lib/storage-transfer-url";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { SharedFolder } from "@/components/ui/SharedFolder";
import {
  getItemShareContext,
  getSharedFolderView,
  getSharedItemDownloadUrl,
} from "@/lib/item-share";

type PageProps = {
  params: Promise<{ code: string }>;
};

export default function SharedItemPage({ params }: PageProps) {
  return (
    <Suspense fallback={<RouteLoading label="Loading shared item" />}>
      <SharedItemContents params={params} />
    </Suspense>
  );
}

async function SharedItemContents({ params }: PageProps) {
  await connection();
  const { code } = await params;
  const context = await getItemShareContext(code);

  if (!context) notFound();

  if (context.root.type === "file") {
    const url = await getSharedItemDownloadUrl(code);
    if (!url) notFound();
    if (url.startsWith(STORAGE_TRANSFER_PATH + "?")) {
      return <main className="grid min-h-screen place-content-center gap-4 p-6">
        <h1 className="text-xl font-semibold">{context.root.name}</h1>
        <StorageDownloadLink className="btn btn-primary" href={url}>Download file</StorageDownloadLink>
      </main>;
    }
    redirect(url);
  }

  const view = await getSharedFolderView(code);
  if (!view) notFound();

  return <SharedFolder code={code} view={view} />;
}
