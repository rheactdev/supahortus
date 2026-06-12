const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

(async () => {
  try {
    const required = [
      "S3_ACCESS_KEY",
      "S3_SECRET",
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_BUCKET_NAME",
    ];
    const missing = required.filter((name) => !process.env[name]);
    if (missing.length > 0) {
      throw new Error(`Missing S3 environment variables: ${missing.join(", ")}`);
    }

    const s3Client = new S3Client({
      endpoint: `https://${process.env.S3_ENDPOINT}`,
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET,
      },
      forcePathStyle: false,
    });

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: "Images/test-direct-upload.txt",
      ContentType: "text/plain",
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    console.log("Presigned URL:", url);

    console.log("Starting fetch PUT...");
    const res = await fetch(url, {
      method: "PUT",
      body: "Test content from Node.js",
      headers: {
        "Content-Type": "text/plain"
      }
    });

    console.log("Status:", res.status);
    console.log("Status Text:", res.statusText);
    const text = await res.text();
    console.log("Response Body:", text);

  } catch (error) {
    console.error("Test failed:", error);
  }
})();
