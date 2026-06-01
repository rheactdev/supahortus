"use client";

import { useState } from "react";
import { generateMissingThumbnails } from "@/app/admin/actions";

export function GenerateThumbnailsButton() {
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<{ count?: number; error?: string } | null>(null);

  const handleGenerate = async () => {
    setIsPending(true);
    setResult(null);
    try {
      const res = await generateMissingThumbnails();
      setResult(res);
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleGenerate}
        disabled={isPending}
        className="btn btn-secondary btn-sm"
      >
        {isPending ? (
          <span className="loading loading-spinner loading-sm" />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
        )}
        Generate Missing Thumbnails
      </button>
      
      {result && (
        <span className={`text-sm ${result.error ? "text-error" : "text-success"}`}>
          {result.error 
            ? `Error: ${result.error}` 
            : `Queued ${result.count} thumbnails for generation`}
        </span>
      )}
    </div>
  );
}
