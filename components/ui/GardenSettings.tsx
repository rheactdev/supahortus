"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameGarden, deleteGarden } from "@/lib/actions";
import type { Garden } from "@/lib/data";
import { Trash } from "@/components/icons/liquid-glass";

interface GardenSettingsProps {
  garden: Garden;
  userId: string;
}

export function GardenSettings({ garden, userId }: GardenSettingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Rename state
  const [name, setName] = useState(garden.name);
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameMsg, setRenameMsg] = useState("");

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleRename = async () => {
    if (!name.trim() || name.trim() === garden.name) return;
    setRenameLoading(true);
    setRenameMsg("");
    try {
      await renameGarden(garden.id, name.trim(), userId);
      setRenameMsg("Garden renamed successfully");
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setRenameMsg(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setRenameLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== garden.name) return;
    setDeleteLoading(true);
    try {
      await deleteGarden(garden.id, userId);
      router.push("/dashboard");
    } catch (err: unknown) {
      setDeleteLoading(false);
      alert(err instanceof Error ? err.message : "Failed to delete garden");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Rename Section */}
      <div className="card bg-base-200/50 border border-base-content/5">
        <div className="card-body gap-4">
          <h2 className="card-title text-lg">General</h2>
          <div className="form-control w-full max-w-md">
            <label className="label">
              <span className="label-text font-medium">Garden Name</span>
            </label>
            <div className="join w-full">
              <input
                type="text"
                className="input input-bordered join-item flex-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
                placeholder="Garden name"
              />
              <button
                className="btn btn-primary join-item"
                onClick={handleRename}
                disabled={
                  !name.trim() ||
                  name.trim() === garden.name ||
                  renameLoading ||
                  isPending
                }
              >
                {renameLoading ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  "Save"
                )}
              </button>
            </div>
            {renameMsg && (
              <label className="label">
                <span className="label-text-alt text-success">{renameMsg}</span>
              </label>
            )}
          </div>

          <div className="form-control w-full max-w-md">
            <label className="label">
              <span className="label-text font-medium">Garden ID</span>
            </label>
            <input
              type="text"
              className="input input-bordered font-mono text-sm"
              value={garden.id}
              readOnly
            />
            <label className="label">
              <span className="label-text-alt text-base-content/50">
                Used internally — cannot be changed
              </span>
            </label>
          </div>

          <div className="form-control w-full max-w-md">
            <label className="label">
              <span className="label-text font-medium">Created</span>
            </label>
            <input
              type="text"
              className="input input-bordered text-sm"
              value={new Date(garden.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              readOnly
            />
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card bg-error/5 border border-error/20">
        <div className="card-body gap-4">
          <h2 className="card-title text-lg text-error">
            <Trash size={20} /> Danger Zone
          </h2>
          <p className="text-sm text-base-content/70">
            Deleting a garden permanently removes all files, folders, and member
            access. This action cannot be undone.
          </p>
          <div className="form-control w-full max-w-md">
            <label className="label">
              <span className="label-text font-medium">
                Type <span className="font-bold text-error">{garden.name}</span>{" "}
                to confirm
              </span>
            </label>
            <input
              type="text"
              className="input input-bordered input-error"
              placeholder={garden.name}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
            />
          </div>
          <div className="card-actions">
            <button
              className="btn btn-error"
              disabled={deleteConfirm !== garden.name || deleteLoading}
              onClick={handleDelete}
            >
              {deleteLoading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <>
                  <Trash size={16} />
                  Delete Garden Permanently
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
