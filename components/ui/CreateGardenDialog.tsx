"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGarden } from "@/lib/actions";
import { Add } from "@/components/icons/liquid-glass";

interface CreateGardenDialogProps {
  userId: string;
}

export function CreateGardenDialog({ userId }: CreateGardenDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const { id } = await createGarden(name.trim(), userId);
      setOpen(false);
      setName("");
      router.push(`/dashboard/garden/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create garden");
    } finally {
      setLoading(false);
    }
  };

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
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Garden Name</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                placeholder="My Garden"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>

            {error && (
              <div role="alert" className="alert alert-error alert-soft mt-4 text-sm">
                {error}
              </div>
            )}

            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setOpen(false);
                  setName("");
                  setError("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={!name.trim() || loading}
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
            <button
              onClick={() => {
                setOpen(false);
                setName("");
                setError("");
              }}
            >
              close
            </button>
          </form>
        </dialog>
      )}
    </>
  );
}
