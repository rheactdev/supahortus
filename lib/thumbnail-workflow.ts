import "server-only";

import { Client } from "@upstash/workflow";
import { getAppBaseUrl } from "@/lib/app-url";
import { processorFileType } from "@/lib/thumbnail-types";

export type ThumbnailPayload = { gardenId: string; itemId: string };

export async function queueThumbnail(
  payload: ThumbnailPayload,
  name: string,
  thumbnailKey: string | null,
) {
  if (thumbnailKey || !processorFileType(name)) return false;

  const token = process.env.QSTASH_TOKEN;
  if (!token || !process.env.IMAGE_PROCESSOR_URL || !process.env.PROCESSOR_SECRET ||
      !process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
    throw new Error("Thumbnail processing is not configured");
  }

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  await new Client({ token }).trigger({
    url: `${getAppBaseUrl()}/api/workflow/thumbnail`,
    body: payload,
    headers: bypass ? { "x-vercel-protection-bypass": bypass } : undefined,
  });
  return true;
}
