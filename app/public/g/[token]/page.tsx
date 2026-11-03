import { Suspense } from "react";
import { RouteLoading } from "@/components/ui/RouteLoading";
import { PublicGarden } from "@/components/ui/PublicGarden";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default function PublicGardenPage({ params }: PageProps) {
  return (
    <Suspense fallback={<RouteLoading label="Loading public garden" />}>
      <PublicGardenContents params={params} />
    </Suspense>
  );
}

async function PublicGardenContents({ params }: PageProps) {
  const { token } = await params;
  return <PublicGarden token={token} folderId={null} />;
}
