const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

(async () => {
  try {
    const s3Client = new S3Client({
      endpoint: "https://s3.eu-central-003.backblazeb2.com",
      region: "eu-central-003",
      credentials: {
        accessKeyId: "003a67ed5c4f7160000000009",
        secretAccessKey: "K003z4nuBSKM26ahyMMb0eSbb+DMz/Y",
      },
      forcePathStyle: false,
    });

    const command = new PutObjectCommand({
      Bucket: "hortus",
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
