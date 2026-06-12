const { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } = require("@aws-sdk/client-s3");

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
      forcePathStyle: false, // Must be false for B2 S3 CORS rules
    });

    const bucket = process.env.S3_BUCKET_NAME;
    const allowedOrigins = (process.env.S3_CORS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
    if (allowedOrigins.length === 0) {
      throw new Error("S3_CORS_ALLOWED_ORIGINS must contain at least one origin");
    }

    console.log(`Setting S3 CORS policy on '${bucket}' bucket...`);
    
    const params = {
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["PUT", "POST", "GET", "HEAD", "DELETE"],
            AllowedOrigins: allowedOrigins,
            ExposeHeaders: ["ETag", "Accept-Ranges", "Content-Range"],
            MaxAgeSeconds: 3600
          }
        ]
      }
    };

    await s3Client.send(new PutBucketCorsCommand(params));
    console.log("CORS updated applied successfully via AWS API!");

    console.log("Verifying configured CORS...");
    const currentCors = await s3Client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    console.log("Current B2 CORS:", JSON.stringify(currentCors.CORSRules, null, 2));
    
  } catch (error) {
    console.error("Failed to update CORS:", error);
  }
})();
