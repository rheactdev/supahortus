"use client";

import { useState } from "react";
import { queueMissingThumbnails, syncS3ToDb } from "@/app/admin/actions";

export function AdminStorageActions() {
  const [pending, setPending] = useState<"sync" | "thumbnails" | null>(null);
  const [result, setResult] = useState<{ added?: number; scanned?: number; error?: string } | null>(null);
  const [thumbnailResult, setThumbnailResult] = useState<{ message: string; error?: boolean } | null>(null);

  async function handleSync() {
    setPending("sync");
    setResult(null);
    try {
      const res = await syncS3ToDb();
      setResult({ added: res.addedCount, scanned: res.scannedCount });
    } catch (e: any) {
      setResult({ error: e.message || "An error occurred" });
    } finally {
      setPending(null);
    }
  }

  async function handleGenerateThumbnails() {
    setPending("thumbnails");
    setThumbnailResult(null);

    let cursor: string | null = null;
    let queued = 0;
    let failed = 0;

    try {
      do {
        const batch = await queueMissingThumbnails(cursor);
        queued += batch.queued;
        failed += batch.failed;
        cursor = batch.nextCursor;
      } while (cursor);

      setThumbnailResult({
        message: failed
          ? `Queued ${queued} thumbnail jobs. Could not queue ${failed}. Try again to retry missing thumbnails.`
          : queued
            ? `Queued thumbnail generation for ${queued} ${queued === 1 ? "file" : "files"}.`
            : "No supported files need thumbnails.",
        error: failed > 0,
      });
    } catch {
      setThumbnailResult({
        message: `Queued ${queued} thumbnail jobs before the scan stopped. Try again to scan for missing thumbnails.`,
        error: true,
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <button
        onClick={handleSync}
        disabled={pending !== null}
        className="btn btn-secondary btn-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={pending === "sync" ? "animate-spin" : ""}>
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
          <path d="M16 21v-5h5"/>
        </svg>
        {pending === "sync" ? "Syncing..." : "Sync from S3"}
      </button>
      {result && (
        <div className="text-xs text-base-content/60">
          {result.error ? (
            <span className="text-error">{result.error}</span>
          ) : (
            <span className="text-success">
              Scanned {result.scanned} objects, added {result.added} new items.
            </span>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={handleGenerateThumbnails}
        disabled={pending !== null}
        className="btn btn-outline btn-sm"
      >
        {pending === "thumbnails" ? "Queueing thumbnails..." : "Generate thumbnails"}
      </button>
      <div role="status" className={thumbnailResult?.error ? "text-sm text-error" : "text-sm"}>
        {thumbnailResult?.message}
      </div>
    </div>
  );
}
