import "server-only";

import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { BUCKET_NAME, s3Client } from "@/lib/s3";

export async function deleteStorageKeys(keys: string[]) {
  if (keys.length === 0) return;

  const result = await s3Client.send(new DeleteObjectsCommand({
    Bucket: BUCKET_NAME,
    Delete: { Objects: keys.map((Key) => ({ Key })) },
  }));
  if (result.Errors?.length) throw new Error("Storage did not delete every requested object");
}
