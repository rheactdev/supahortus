import "server-only";

import { Client } from "@upstash/workflow";
import { getAppBaseUrl } from "@/lib/app-url";
import { needsThumbnailGeneration, processorFileType, type ThumbnailKeys } from "@/lib/thumbnail-types";

export type ThumbnailPayload = { gardenId: string; itemId: string };

export async function queueThumbnail(
  payload: ThumbnailPayload,
  name: string,
  keys: ThumbnailKeys,
) {
  if (!needsThumbnailGeneration(name, keys)) return false;

  const token = process.env.QSTASH_TOKEN;
  if (!token || !process.env.QSTASH_CURRENT_SIGNING_KEY || !process.env.QSTASH_NEXT_SIGNING_KEY) {
    throw new Error("Thumbnail processing is not configured");
  }
  if (processorFileType(name) && !keys.thumbnail_key &&
      (!process.env.IMAGE_PROCESSOR_URL || !process.env.PROCESSOR_SECRET)) {
    throw new Error("Design preview processing is not configured");
  }

  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  await new Client({ token }).trigger({
    url: `${getAppBaseUrl()}/api/workflow/thumbnail`,
    body: payload,
    headers: bypass ? { "x-vercel-protection-bypass": bypass } : undefined,
  });
  return true;
}
