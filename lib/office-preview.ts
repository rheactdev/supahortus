import "server-only";

import { Client } from "@upstash/qstash";
import { getAppBaseUrl } from "@/lib/app-url";
import { supabaseAdmin } from "@/lib/supabase/admin";

const OFFICE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"]);

export function isOfficeFile(filename: string): boolean {
  const extension = filename.toLowerCase().split(".").pop() ?? "";
  return OFFICE_EXTENSIONS.has(extension);
}

export function officePreviewKey(itemId: string): string {
  return `hortus/_previews/office/${itemId}.pdf`;
}

export async function queueOfficePreview(item: {
  id: string;
  garden_id: string;
  name: string;
  s3_key: string;
}) {
  if (!isOfficeFile(item.name)) return false;

  const previewKey = officePreviewKey(item.id);
  const { error } = await supabaseAdmin
    .from("items")
    .update({
      preview_key: previewKey,
      preview_status: "pending",
      preview_error: null,
    })
    .eq("id", item.id);

  if (error) throw error;

  const qstash = new Client({ token: process.env.QSTASH_TOKEN || "" });
  await qstash.publishJSON({
    url: `${getAppBaseUrl()}/api/workflow/office-preview`,
    headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? {
          "x-vercel-protection-bypass":
            process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        }
      : undefined,
    body: {
      gardenId: item.garden_id,
      itemId: item.id,
      s3Key: item.s3_key,
      previewKey,
      filename: item.name,
    },
    retries: 3,
  });

  return true;
}
