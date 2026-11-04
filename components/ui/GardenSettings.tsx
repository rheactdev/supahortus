"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteGarden, renameGarden } from "@/lib/actions";
import type { Garden } from "@/lib/data";
import { Trash } from "../icons/liquid-glass";

interface GardenSettingsProps {
  garden: Garden;
  userId: string;
  storagePrefix: string;
}

export function GardenSettings({ garden, userId, storagePrefix }: GardenSettingsProps) {
  const router = useRouter();
  const [name, setName] = useState(garden.name);
  const [savedName, setSavedName] = useState(garden.name);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<{ message: string; failed: boolean } | null>(null);
  const canSave = Boolean(name.trim()) && name.trim() !== savedName && !pending;
  const details = [
    { label: "Slug", value: garden.slug },
    { label: "Storage path", value: storagePrefix },
    { label: "Garden ID", value: garden.id },
    {
      label: "Created",
      value: new Date(garden.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    },
  ];

  function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;

    const nextName = name.trim();
    setStatus("");
    setError("");
    startTransition(async () => {
      try {
        await renameGarden(garden.id, nextName, userId);
        setName(nextName);
        setSavedName(nextName);
        setStatus("Garden name saved.");
        router.refresh();
      } catch {
        setError("Could not save the garden name. Try again.");
      }
    });
  }

  async function copyDetail(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback({ message: label + " copied.", failed: false });
    } catch {
      setCopyFeedback({ message: "Could not copy " + label.toLowerCase() + ". Select the value to copy it manually.", failed: true });
    }
  }

  return (
    <section aria-labelledby="garden-settings" className="mt-6 max-w-xl space-y-4">
      <form onSubmit={handleRename}>
        {/* <h2 className="text-lg font-semibold">Overview</h2> */}
        <fieldset className="fieldset gap-2 py-0">
          <label htmlFor="garden-name" className="label text-base-content text-xl mb-1 font-semibold">
            Name
          </label>
          <div className="join w-full max-w-sm">
            <input
              id="garden-name"
              className="input join-item min-w-0 flex-1"
              value={name}
              disabled={pending}
              onChange={(event) => {
                setName(event.target.value);
                setStatus("");
                setError("");
              }}
              required
            />
            <button type="submit" className="btn join-item shrink-0 btn-primary" disabled={!canSave}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
          {status && <p role="status" className="mt-2 text-sm text-success">{status}</p>}
          {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
        </fieldset>
      </form>

      <ul role="list" className="list gap-2 text-sm">
        {details.map(({ label, value }) => (
          <li key={label} className="list-row min-h-6 items-center gap-x-3 p-0 after:hidden">
            <span className="w-24 text-base-content/70 sm:w-38">{label}</span>
            <div className="list-col-grow flex min-w-0 items-center gap-2.5">
              {label === "Created" ? (
                <span>{value}</span>
              ) : (
                <>
                  <code className="min-w-0 select-text wrap-anywhere">{value}</code>
                  <button
                    type="button"
                    className="btn btn-ghost btn-square btn-xs shrink-0 self-center text-base-content/70"
                    aria-label={"Copy " + label.toLowerCase()}
                    title={"Copy " + label.toLowerCase()}
                    onClick={() => void copyDetail(label, value)}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="size-4">
                      <rect x="8" y="8" width="12" height="12" rx="2" />
                      <path strokeLinecap="round" d="M4 15V6a2 2 0 0 1 2-2h9" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {copyFeedback && (
        <p role={copyFeedback.failed ? "alert" : "status"} className="mt-2 text-sm text-base-content/75">
          {copyFeedback.message}
        </p>
      )}
    </section>
  );
}

export function GardenDangerZone({ garden, userId }: Pick<GardenSettingsProps, "garden" | "userId">) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || confirmation !== garden.name) return;

    setPending(true);
    setError("");
    try {
      await deleteGarden(garden.id, userId);
      router.push("/admin/gardens");
    } catch {
      setError("Could not delete the garden. Try again.");
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="garden-danger" className="mt-8 space-y-3 pb-6">
      <h2 id="garden-danger" className="text-lg font-semibold">Danger zone</h2>
      <div>
        <button
          type="button"
          className="btn btn-error"
          onClick={() => {
            setConfirmation("");
            setError("");
            dialog.current?.showModal();
          }}
        >
          <Trash size={18}/>Delete Garden
        </button>
      </div>
      <dialog
        ref={dialog}
        className="modal"
        aria-labelledby="delete-garden-title"
        aria-describedby="delete-garden-description"
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <div className="modal-box">
          <h3 id="delete-garden-title" className="text-lg font-bold">Delete garden?</h3>
          <p id="delete-garden-description" className="mt-2 text-sm">
            Member access and share links are revoked immediately. File cleanup runs in the
            background, and the slug becomes available when cleanup finishes.
          </p>
          <form onSubmit={handleDelete} className="mt-4">
            <fieldset className="fieldset">
              <label htmlFor="delete-garden-confirmation" className="wrap-anywhere text-sm">
                Type <strong>{garden.name}</strong> to confirm.
              </label>
              <input
                id="delete-garden-confirmation"
                className="input w-full"
                value={confirmation}
                disabled={pending}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                autoFocus
              />
            </fieldset>
            {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
            <div className="modal-action">
              <button type="button" className="btn" disabled={pending} onClick={() => dialog.current?.close()}>
                Cancel
              </button>
              <button type="submit" className="btn btn-error" disabled={pending || confirmation !== garden.name}>
                {pending ? "Deleting…" : "Delete garden"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </section>
  );
}
