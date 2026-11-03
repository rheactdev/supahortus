import { Suspense } from "react";
import { RouteLoading } from "@/components/ui/RouteLoading";
import { PublicGarden } from "@/components/ui/PublicGarden";

type PageProps = {
  params: Promise<{ token: string; folder: string }>;
};

export default function PublicGardenFolderPage({ params }: PageProps) {
  return (
    <Suspense fallback={<RouteLoading label="Loading public garden folder" />}>
      <PublicGardenFolderContents params={params} />
    </Suspense>
  );
}

async function PublicGardenFolderContents({ params }: PageProps) {
  const { token, folder } = await params;
  return <PublicGarden token={token} folderId={folder} />;
}
