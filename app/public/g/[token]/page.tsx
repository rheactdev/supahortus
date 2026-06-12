import { PublicGarden } from "@/components/ui/PublicGarden";

export default async function PublicGardenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicGarden token={token} folderId={null} />;
}
