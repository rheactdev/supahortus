import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { serve } from "@upstash/workflow/nextjs";
import { getAppBaseUrl } from "@/lib/app-url";
import { isOfficeFile } from "@/lib/office-preview";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { supabaseAdmin } from "@/lib/supabase/admin";

type OfficePreviewPayload = {
  gardenId: string;
  itemId: string;
  s3Key: string;
  previewKey: string;
  filename: string;
};

export const { POST } = serve<OfficePreviewPayload>(
  async (context) => {
    const { gardenId, itemId, s3Key, previewKey, filename } =
      context.requestPayload;

    await context.run("validate-item", async () => {
      const { data, error } = await supabaseAdmin
        .from("items")
        .select("id, garden_id, s3_key, name, status")
        .eq("id", itemId)
        .single();

      if (
        error ||
        !data ||
        data.garden_id !== gardenId ||
        data.s3_key !== s3Key ||
        data.name !== filename ||
        data.status !== "ready" ||
        !isOfficeFile(filename)
      ) {
        throw new Error("Office preview payload no longer matches the item");
      }
    });

    const sourceUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key }),
      { expiresIn: 900 },
    );
    const destinationUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: previewKey,
        ContentType: "application/pdf",
      }),
      { expiresIn: 900 },
    );

    try {
      await context.run("convert-office-document", async () => {
        const converterUrl = process.env.OFFICE_CONVERTER_URL?.replace(
          /\/+$/,
          "",
        );
        const converterSecret = process.env.OFFICE_CONVERTER_SECRET;
        if (!converterUrl || !converterSecret) {
          throw new Error("Office converter is not configured");
        }

        const response = await fetch(`${converterUrl}/convert`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${converterSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sourceUrl,
            destinationUrl,
            filename,
          }),
          signal: AbortSignal.timeout(12 * 60 * 1000),
        });

        if (!response.ok) {
          const detail = (await response.text()).slice(0, 500);
          throw new Error(
            `Office converter returned ${response.status}: ${detail}`,
          );
        }
      });
    } catch (error) {
      await context.run("mark-preview-failed", async () => {
        await supabaseAdmin
          .from("items")
          .update({
            preview_status: "failed",
            preview_error:
              error instanceof Error
                ? error.message.slice(0, 500)
                : "Office conversion failed",
          })
          .eq("id", itemId);
      });
      throw error;
    }

    await context.run("mark-preview-ready", async () => {
      const { error } = await supabaseAdmin
        .from("items")
        .update({
          preview_key: previewKey,
          preview_status: "ready",
          preview_error: null,
        })
        .eq("id", itemId);

      if (error) throw error;
    });

    await context.call("revalidate-cache", {
      url: `${getAppBaseUrl()}/api/revalidate?tag=garden-${gardenId}`,
      method: "POST",
      headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
        ? {
            "x-vercel-protection-bypass":
              process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          }
        : undefined,
    });
  },
  {
    failureFunction: async ({ failStatus, failResponse }) => {
      console.error(
        `[workflow/office-preview] Failed (${failStatus}):`,
        failResponse,
      );
    },
  },
);
