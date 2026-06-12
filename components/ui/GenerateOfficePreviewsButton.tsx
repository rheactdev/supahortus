"use client";

import { useState } from "react";
import { generateMissingOfficePreviews } from "@/app/admin/actions";

export function GenerateOfficePreviewsButton() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const handleGenerate = async () => {
    setPending(true);
    setMessage("");
    try {
      const result = await generateMissingOfficePreviews();
      setMessage(`Queued ${result.count} Office preview${result.count === 1 ? "" : "s"}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to queue previews");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={handleGenerate}
        disabled={pending}
      >
        {pending ? (
          <span className="loading loading-spinner loading-sm" />
        ) : null}
        Generate Office Previews
      </button>
      {message ? <span className="text-xs text-base-content/60">{message}</span> : null}
    </div>
  );
}
