import { PublicGarden } from "@/components/ui/PublicGarden";

export default async function PublicGardenFolderPage({
  params,
}: {
  params: Promise<{ token: string; folder: string }>;
}) {
  const { token, folder } = await params;
  return <PublicGarden token={token} folderId={folder} />;
}
