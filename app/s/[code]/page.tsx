import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { SharedFolder } from "@/components/ui/SharedFolder";
import {
  getItemShareContext,
  getSharedFolderView,
  getSharedItemDownloadUrl,
} from "@/lib/item-share";

export default async function SharedItemPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await connection();
  const { code } = await params;
  const context = await getItemShareContext(code);

  if (!context) notFound();

  if (context.root.type === "file") {
    const url = await getSharedItemDownloadUrl(code);
    if (!url) notFound();
    redirect(url);
  }

  const view = await getSharedFolderView(code);
  if (!view) notFound();

  return <SharedFolder code={code} view={view} />;
}
