"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { deleteGarden, renameGarden } from "@/lib/actions";
import type { Garden } from "@/lib/data";

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

  return (
    <section className="mt-4">
      <div>
        <form onSubmit={handleRename} className="max-w-xl">
          <fieldset className="fieldset">
            <label htmlFor="garden-name" className="label">Garden Name</label>
            <div className="join">
              <input
                id="garden-name"
                className="input join-item"
                value={name}
                disabled={pending}
                onChange={(event) => {
                  setName(event.target.value);
                  setStatus("");
                  setError("");
                }}
                required
              />
              <button type="submit" className="btn join-item" disabled={!canSave}>
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </fieldset>
          {status && <p role="status" className="mt-2 text-sm text-success">{status}</p>}
          {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
        </form>
        <ul className="list">
          {/* <li className="list-row">
            <label htmlFor="garden-name" className="w-30 text-xs uppercase font-semibold opacity-60">Garden Name</label>
            <div className="join">

              <input
                id="garden-name"
                className="input join-item"
                value={name}
                disabled={pending}
                onChange={(event) => {
                  setName(event.target.value);
                  setStatus("");
                  setError("");
                }}
                required
              />
              <button type="submit" className="btn join-item" disabled={!canSave}>
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </li> */}
          {details.map(({ label, value }) => (
            <li className="list-row">
              <p className="w-30 text-xs uppercase font-semibold opacity-60">{label}</p>
              <p>{value}</p>
            </li>
          ))}
        </ul>
        {/* <dl className="grid min-w-0 gap-x-6 gap-y-3 sm:grid-cols-2">
          {details.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-sm font-medium">{label}</dt>
              <dd className="mt-1 select-text wrap-anywhere text-sm text-base-content/75">
                {label === "Created" ? value : <code>{value}</code>}
              </dd>
            </div>
          ))}
        </dl> */}
      </div>
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
    <section aria-labelledby="garden-danger" className="grid items-start gap-4 py-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
      <div>
        <h2 id="garden-danger" className="text-lg font-semibold">Danger zone</h2>
        <p className="mt-1 text-sm text-base-content/75">Permanently delete this garden and start file cleanup.</p>
      </div>
      <div>
        <button
          type="button"
          className="btn btn-error btn-outline btn-sm"
          onClick={() => {
            setConfirmation("");
            setError("");
            dialog.current?.showModal();
          }}
        >
          Delete garden
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
