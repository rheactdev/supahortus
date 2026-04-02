"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGarden } from "@/lib/actions";
import { Add } from "@/components/icons/liquid-glass";

interface CreateGardenDialogProps {
  userId: string;
  inline?: boolean;
}

const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export function CreateGardenDialog({ userId, inline }: CreateGardenDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const slugValid = slug.length >= 2 && slug.length <= 48 && SLUG_REGEX.test(slug);

  const autoSlug = (input: string) =>
    input
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slugTouched) setSlug(autoSlug(val));
  };

  const handleCreate = async () => {
    if (!name.trim() || !slugValid) return;
    setLoading(true);
    setError("");
    try {
      const { slug: gardenSlug } = await createGarden(name.trim(), slug, userId);
      setOpen(false);
      setName("");
      setSlug("");
      setSlugTouched(false);
      router.push(`/my-gardens/${gardenSlug}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create garden");
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setOpen(false);
    setName("");
    setSlug("");
    setSlugTouched(false);
    setError("");
  };

  const formContent = (
    <>
      <div className="form-control w-full">
        <label className="label">
          <span className="label-text">Display Name</span>
        </label>
        <input
          type="text"
          className="input input-bordered w-full"
          placeholder="Hopkins Medical Cases"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          autoFocus
        />
      </div>

      <div className="form-control w-full mt-3">
        <label className="label">
          <span className="label-text">
            Slug <span className="text-base-content/40">(permanent ID)</span>
          </span>
        </label>
        <label className="input input-bordered flex items-center gap-1">
          <span className="text-base-content/40 text-sm">hortus/</span>
          <input
            type="text"
            className="grow bg-transparent outline-none font-mono text-sm"
            placeholder="hopkins-cases"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
            }}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
        </label>
        <label className="label">
          <span className={`label-text-alt ${slug && !slugValid ? "text-error" : "text-base-content/40"}`}>
            {slug && !slugValid
              ? "2-48 chars, lowercase a-z, 0-9, hyphens"
              : "Cannot be changed after creation"}
          </span>
        </label>
      </div>

      {error && (
        <div role="alert" className="alert alert-error alert-soft mt-2 text-sm">
          {error}
        </div>
      )}
    </>
  );

  if (inline) {
    return (
      <div className="card bg-base-200/50 border border-base-content/5">
        <div className="card-body gap-4">
          {formContent}
          <div className="card-actions justify-end mt-2">
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={!name.trim() || !slugValid || loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                "Create Garden"
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        <Add size={16} />
        New Garden
      </button>

      {open && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg mb-4">Create Garden</h3>

            {formContent}

            <div className="modal-action">
              <button className="btn btn-ghost" onClick={resetAndClose}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!name.trim() || !slugValid || loading}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  "Create"
                )}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={resetAndClose}>close</button>
          </form>
        </dialog>
      )}
    </>
  );
}
