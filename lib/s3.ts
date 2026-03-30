import { S3Client } from "@aws-sdk/client-s3";

if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET || !process.env.S3_ENDPOINT || !process.env.S3_REGION) {
  throw new Error("Missing S3 configuration in environment variables");
}

export const s3Client = new S3Client({
  endpoint: `https://${process.env.S3_ENDPOINT}`,
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET,
  },
  forcePathStyle: false, // Must be false for virtual-hosted-style paths so B2 can correctly map CORS rules
});

export const BUCKET_NAME = process.env.S3_BUCKET_NAME!;
