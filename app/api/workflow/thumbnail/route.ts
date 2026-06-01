import { serve } from "@upstash/workflow/nextjs";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "@/lib/s3";
import { supabaseAdmin } from "@/lib/supabase/admin";
import sharp from "sharp";
import unzipper from "unzipper";
import { readPsd } from "ag-psd";

type ThumbnailPayload = {
  gardenId: string;
  itemId: string;
  s3Key: string;
  filename: string;
};

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export const { POST } = serve<ThumbnailPayload>(
  async (context) => {
    const { gardenId, itemId, s3Key, filename } = context.requestPayload;

    const thumbnailS3Key = s3Key.replace(/\.[^/.]+$/, "") + "_thumb.webp";

    const { thumbnailBuffer } = await context.run("generate-thumbnail", async () => {
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
        })
      );

      const bodyStream = response.Body as NodeJS.ReadableStream;
      if (!bodyStream) throw new Error("No body in S3 response");

      let rawImageBuffer: Buffer | null = null;
      const lowerFilename = filename.toLowerCase();

      // Affinity files (.af, .afdesign, .afphoto, .afpub)
      if (lowerFilename.match(/\.(af|afdesign|afphoto|afpub)$/)) {
        rawImageBuffer = await new Promise<Buffer>((resolve, reject) => {
          let found = false;
          bodyStream
            .pipe(unzipper.Parse())
            .on("entry", async (entry: unzipper.Entry) => {
              if (
                entry.path === "QuickLook/Thumbnail.jpg" ||
                entry.path === "Preview.png" ||
                entry.path.toLowerCase().endsWith("thumbnail.jpg")
              ) {
                found = true;
                try {
                  const buf = await entry.buffer();
                  resolve(buf);
                } catch (e) {
                  reject(e);
                }
              } else {
                entry.autodrain();
              }
            })
            .on("close", () => {
              if (!found) reject(new Error("No embedded thumbnail found in Affinity file."));
            })
            .on("error", reject);
        });
      }
      // Photoshop files (.psd)
      else if (lowerFilename.endsWith(".psd")) {
        const fullBuffer = await streamToBuffer(bodyStream);
        const psd = readPsd(fullBuffer, { 
          skipLayerImageData: true, 
          skipCompositeImageData: true,
          useRawThumbnail: true 
        });
        
        if (psd.imageResources?.thumbnailRaw) {
          rawImageBuffer = Buffer.from(psd.imageResources.thumbnailRaw.data);
        } else {
          throw new Error("Could not extract thumbnail from PSD.");
        }
      } else {
        throw new Error("Unsupported file type for background thumbnailing");
      }

      // Optimize and resize with sharp
      if (!rawImageBuffer) throw new Error("Failed to extract image buffer");

      const optimized = await sharp(rawImageBuffer)
        .resize(800, 800, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      // We have to return standard objects (or strings) from context.run, Buffer is serialized as object
      return { thumbnailBuffer: optimized.toString("base64") };
    });

    // Upload thumbnail to S3
    await context.run("upload-thumbnail", async () => {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: thumbnailS3Key,
          Body: Buffer.from(thumbnailBuffer, "base64"),
          ContentType: "image/webp",
        })
      );
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
    const baseUrl = process.env.UPSTASH_WORKFLOW_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    await context.call("revalidate-cache", {
      url: `${baseUrl}/api/revalidate?tag=garden-${gardenId}`,
      method: "POST",
    });
  },
  {
    failureFunction: async ({ failStatus, failResponse }) => {
      console.error(`[workflow/thumbnail] Failed (${failStatus}):`, failResponse);
    },
  }
);
