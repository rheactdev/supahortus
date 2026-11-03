import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

type UploadDestination = {
  userId: string;
  gardenId: string;
  parentId: string | null;
  filename: string;
  contentType: string;
  key: string;
  uploadId?: string;
};

type UploadTicket = UploadDestination & {
  itemId: string;
  expiresAt: number;
};

const TICKET_LIFETIME_MS = 24 * 60 * 60 * 1000;

function sign(payload: string) {
  const secret = process.env.S3_SECRET;
  if (!secret) throw new Error("Missing storage signing secret");
  return createHmac("sha256", secret).update("hortus-upload-ticket-v1:").update(payload).digest();
}

export function issueUploadTicket(destination: UploadDestination) {
  const ticket: UploadTicket = {
    ...destination,
    itemId: randomUUID(),
    expiresAt: Date.now() + TICKET_LIFETIME_MS,
  };
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${sign(payload).toString("base64url")}`;
}

export function readUploadTicket(token: unknown, userId: string): UploadTicket | null {
  if (typeof token !== "string") return null;
  const match = /^([\w-]+)\.([\w-]{43})$/.exec(token);
  if (!match) return null;
  const [, payload, encodedSignature] = match;
  const signature = Buffer.from(encodedSignature, "base64url");
  if (!timingSafeEqual(signature, sign(payload))) return null;

  const ticket: UploadTicket = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return ticket.userId === userId && ticket.expiresAt > Date.now() ? ticket : null;
}
