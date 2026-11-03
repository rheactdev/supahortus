"use client";

import { useState, useTransition } from "react";
import { deleteAdminTableUser } from "./actions";

export function DeleteUserButton({ userId, label }: { userId: string; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(`Permanently delete the account for ${label}?`)) return;

    setError(null);
    startTransition(async () => {
      try {
        setError(await deleteAdminTableUser(userId));
      } catch {
        setError("Could not delete this user. Please try again.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-error btn-outline btn-sm"
        aria-label={pending ? `Deleting ${label}` : `Delete ${label}`}
        disabled={pending}
        onClick={handleDelete}
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <p role="alert" className="mt-1 text-sm text-error">{error}</p>}
    </>
  );
}
