import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SharedFolder } from "@/components/ui/SharedFolder";
import { getSharedFolderView } from "@/lib/item-share";

export default async function SharedFolderPage({
  params,
}: {
  params: Promise<{ code: string; folder: string }>;
}) {
  await connection();
  const { code, folder } = await params;
  const view = await getSharedFolderView(code, folder);

  if (!view) notFound();

  return <SharedFolder code={code} view={view} />;
}
