const { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } = require("@aws-sdk/client-s3");

(async () => {
  try {
    const s3Client = new S3Client({
      endpoint: "https://s3.eu-central-003.backblazeb2.com",
      region: "eu-central-003",
      credentials: {
        accessKeyId: "003a67ed5c4f7160000000009",
        secretAccessKey: "K003z4nuBSKM26ahyMMb0eSbb+DMz/Y",
      },
      forcePathStyle: false, // Must be false for B2 S3 CORS rules
    });

    console.log("Setting S3 standard CORS policy on 'hortus' bucket...");
    
    const params = {
      Bucket: "hortus",
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["PUT", "POST", "GET", "HEAD", "DELETE"],
            AllowedOrigins: ["*"], 
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600
          }
        ]
      }
    };

    await s3Client.send(new PutBucketCorsCommand(params));
    console.log("CORS updated applied successfully via AWS API!");

    console.log("Verifying configured CORS...");
    const currentCors = await s3Client.send(new GetBucketCorsCommand({ Bucket: "hortus" }));
    console.log("Current B2 CORS:", JSON.stringify(currentCors.CORSRules, null, 2));
    
  } catch (error) {
    console.error("Failed to update CORS:", error);
  }
})();
