import { serve } from "@upstash/workflow/nextjs";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getAppBaseUrl } from "@/lib/app-url";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
type ThumbnailPayload = {
  gardenId: string;
  itemId: string;
  s3Key: string;
  filename: string;
};

export const { POST } = serve<ThumbnailPayload>(
  async (context) => {
    const { gardenId, itemId, s3Key, filename } = context.requestPayload;

    const thumbnailS3Key = s3Key.replace(/\.[^/.]+$/, "") + "_thumb.webp";

    const sourceUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }),
      { expiresIn: 900 }
    );

    const destinationUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({ Bucket: BUCKET_NAME, Key: thumbnailS3Key, ContentType: "image/webp" }),
      { expiresIn: 900 }
    );

    await context.run("process-image", async () => {
      const processorUrl = process.env.IMAGE_PROCESSOR_URL;
      if (!processorUrl) throw new Error("IMAGE_PROCESSOR_URL is not set");

      const fileType = filename.toLowerCase().endsWith(".psd") ? "psd" : "af";

      const res = await fetch(`${processorUrl}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.PROCESSOR_SECRET}`,
        },
        body: JSON.stringify({
          sourceUrl,
          destinationUrl,
          fileType,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Processor error: ${text}`);
      }
    });
    // Update DB row
    await context.run("update-db", async () => {
      const { error } = await supabaseAdmin
        .from("items")
        .update({ thumbnail_key: thumbnailS3Key })
        .eq("id", itemId);

      if (error) throw error;
    });

    // Revalidate cache
    await context.call("revalidate-cache", {
      url: `${getAppBaseUrl()}/api/revalidate?tag=garden-${gardenId}`,
      method: "POST",
      headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? {
        "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      } : undefined,
    });
  },
  {
    failureFunction: async ({ failStatus, failResponse }) => {
      console.error(`[workflow/thumbnail] Failed (${failStatus}):`, failResponse);
    },
  }
);
