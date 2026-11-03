import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
  UploadPartCopyCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BUCKET_NAME, s3Client } from "@/lib/s3";
import { storageKeyMarker } from "@/lib/storage-transfer-url";
export { isEncryptedObject } from "@/lib/storage-transfer-url";

const versionPattern = /^[a-zA-Z0-9_]{1,32}$/;
const headerPrefix = "x-amz-server-side-encryption-customer-";

function basename(key: string) {
  return key.slice(key.lastIndexOf("/") + 1);
}

function masterKey(version: string) {
  const value = process.env[`S3_SSE_C_KEY_${version}`];
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    throw new Error(`Invalid or missing SSE-C master key version ${version}`);
  }
  return Buffer.from(value, "base64");
}

export function newUploadKey(key: string) {
  const name = basename(key);
  if (!name || name.startsWith(".ssec~")) throw new Error("Invalid upload name");
  const version = process.env.S3_SSE_C_ACTIVE_VERSION;
  if (!version) return key;
  if (!versionPattern.test(version)) throw new Error("Invalid SSE-C active version");
  masterKey(version);
  return key.slice(0, -name.length) + `.ssec~${version}~${randomUUID()}~${name}`;
}

export function preserveEncryption(source: string, destination: string) {
  const prefix = storageKeyMarker(source)?.[0];
  const name = basename(destination);
  if (!name) return destination;
  if (name.startsWith(".ssec~")) throw new Error("Reserved storage filename");
  return prefix ? destination.slice(0, -name.length) + prefix + name : destination;
}

export function encryptionInput(key: string) {
  const version = storageKeyMarker(key)?.[1];
  if (!version) return {};
  const bytes = createHmac("sha256", masterKey(version))
    .update(JSON.stringify(["hortus-b2-sse-c-v1", BUCKET_NAME, key]))
    .digest();
  return {
    SSECustomerAlgorithm: "AES256",
    SSECustomerKey: bytes.toString("base64"),
    SSECustomerKeyMD5: createHash("md5").update(bytes).digest("base64"),
  };
}

export async function signObject(
  command: GetObjectCommand | PutObjectCommand | UploadPartCommand,
  expiresIn = 900,
) {
  const { SSECustomerAlgorithm, SSECustomerKey, SSECustomerKeyMD5 } = command.input;
  const headers: Record<string, string> = SSECustomerKey ? {
    [headerPrefix + "algorithm"]: SSECustomerAlgorithm!,
    [headerPrefix + "key"]: SSECustomerKey,
    [headerPrefix + "key-md5"]: SSECustomerKeyMD5!,
  } : {};
  const options = { expiresIn, unhoistableHeaders: new Set(Object.keys(headers)) };
  let url: string;
  try {
    if (command instanceof GetObjectCommand) {
      url = await getSignedUrl(s3Client, command, options);
    } else if (command instanceof PutObjectCommand) {
      url = await getSignedUrl(s3Client, command, options);
    } else {
      url = await getSignedUrl(s3Client, command, options);
    }
  } catch {
    throw new Error("B2 transfer signing failed");
  }
  if (SSECustomerKey) {
    const query = new URL(url).searchParams;
    const signed = query.get("X-Amz-SignedHeaders")?.split(";") ?? [];
    if (Object.keys(headers).some((name) => query.has(name) || !signed.includes(name))) {
      throw new Error("SSE-C headers were not signed safely");
    }
  }
  return { url, headers };
}

export function relocatedThumbnailKey(source: string, originalDestination: string) {
  const marker = storageKeyMarker(originalDestination)?.[0] ?? "";
  const path = originalDestination.slice(0, originalDestination.lastIndexOf("/") + 1);
  const name = basename(originalDestination).slice(marker.length);
  return preserveEncryption(source, path + name.replace(/\.[^/.]+$/, "") + "_thumb.webp");
}

export async function requireUploadedEncryptedObject(key: string) {
  const input = encryptionInput(key);
  if (!input.SSECustomerKey) return;
  const object = await s3Client.send(new HeadObjectCommand({
    Bucket: BUCKET_NAME, Key: key, ...input,
  })).catch(() => { throw new Error("Could not read encrypted object metadata"); });
  if (object.ServerSideEncryption === "AES256") throw new Error("Object was stored with SSE-B2");
}

export async function copyStorageObject(source: string, destination: string) {
  if (source === destination) return;
  try {
    await copyObject(source, destination);
  } catch {
    throw new Error("B2 object copy failed");
  }
}

async function copyObject(source: string, destination: string) {
  const sourceEncryption = encryptionInput(source);
  const copySource = {
    CopySource: `${BUCKET_NAME}/${source.split("/").map(encodeURIComponent).join("/")}`,
    CopySourceSSECustomerAlgorithm: sourceEncryption.SSECustomerAlgorithm,
    CopySourceSSECustomerKey: sourceEncryption.SSECustomerKey,
    CopySourceSSECustomerKeyMD5: sourceEncryption.SSECustomerKeyMD5,
  };
  const destinationInput = { Bucket: BUCKET_NAME, Key: destination, ...encryptionInput(destination) };

  if (!sourceEncryption.SSECustomerKey) {
    await s3Client.send(new CopyObjectCommand({ ...destinationInput, ...copySource }));
    return;
  }

  const object = await s3Client.send(new HeadObjectCommand({
    Bucket: BUCKET_NAME, Key: source, ...sourceEncryption,
  }));
  if (object.ContentLength === undefined) throw new Error("Missing source object size");
  if (object.ContentLength < 5_000_000_000) {
    await s3Client.send(new CopyObjectCommand({
      ...destinationInput, ...copySource, CopySourceIfMatch: object.ETag,
    }));
    return;
  }

  const { UploadId } = await s3Client.send(new CreateMultipartUploadCommand({
    ...destinationInput,
    ContentType: object.ContentType,
    ContentDisposition: object.ContentDisposition,
    ContentEncoding: object.ContentEncoding,
    ContentLanguage: object.ContentLanguage,
    CacheControl: object.CacheControl,
    Expires: object.Expires,
    Metadata: object.Metadata,
  }));
  if (!UploadId) throw new Error("B2 did not return a copy upload ID");

  try {
    const partSize = Math.max(512 * 1024 * 1024, Math.ceil(object.ContentLength / 10_000));
    const parts = [];
    for (let start = 0; start < object.ContentLength; start += partSize) {
      const PartNumber = parts.length + 1;
      const end = Math.min(start + partSize, object.ContentLength) - 1;
      const { CopyPartResult } = await s3Client.send(new UploadPartCopyCommand({
        ...destinationInput,
        ...copySource,
        CopySourceIfMatch: object.ETag,
        CopySourceRange: `bytes=${start}-${end}`,
        PartNumber,
        UploadId,
      }));
      if (!CopyPartResult?.ETag) throw new Error("B2 did not return a copied part ETag");
      parts.push({ PartNumber, ETag: CopyPartResult.ETag });
    }
    await s3Client.send(new CompleteMultipartUploadCommand({
      ...destinationInput, UploadId, MultipartUpload: { Parts: parts },
    }));
  } catch {
    await s3Client.send(new AbortMultipartUploadCommand({
      Bucket: BUCKET_NAME, Key: destination, UploadId,
    })).catch(() => undefined);
    throw new Error("B2 multipart copy failed");
  }
}
