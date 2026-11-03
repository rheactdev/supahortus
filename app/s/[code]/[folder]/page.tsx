import { Suspense } from "react";
import { RouteLoading } from "@/components/ui/RouteLoading";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SharedFolder } from "@/components/ui/SharedFolder";
import { getSharedFolderView } from "@/lib/item-share";

type PageProps = {
  params: Promise<{ code: string; folder: string }>;
};

export default function SharedFolderPage({ params }: PageProps) {
  return (
    <Suspense fallback={<RouteLoading label="Loading shared folder" />}>
      <SharedFolderContents params={params} />
    </Suspense>
  );
}

async function SharedFolderContents({ params }: PageProps) {
  await connection();
  const { code, folder } = await params;
  const view = await getSharedFolderView(code, folder);

  if (!view) notFound();

  return <SharedFolder code={code} view={view} />;
}
