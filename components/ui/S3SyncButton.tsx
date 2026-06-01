"use client";

import { useState } from "react";
import { syncS3ToDb } from "@/app/admin/actions";

export function S3SyncButton() {
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<{ added?: number; scanned?: number; error?: string } | null>(null);

  async function handleSync() {
    setIsPending(true);
    setResult(null);
    try {
      const res = await syncS3ToDb();
      setResult({ added: res.addedCount, scanned: res.scannedCount });
    } catch (e: any) {
      setResult({ error: e.message || "An error occurred" });
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <button
        onClick={handleSync}
        disabled={isPending}
        className="btn btn-secondary btn-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isPending ? "animate-spin" : ""}>
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
          <path d="M16 21v-5h5"/>
        </svg>
        {isPending ? "Syncing..." : "Sync from S3"}
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
    </div>
  );
}
