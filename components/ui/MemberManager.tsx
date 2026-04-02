"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addGardenMember,
  updateGardenMember,
  removeGardenMember,
} from "@/lib/actions";
import type { GardenMember } from "@/lib/data";
import { Add, Trash, Close } from "@/components/icons/liquid-glass";

interface MemberManagerProps {
  gardenId: string;
  members: (GardenMember & { email: string })[];
  userId: string;
  gardenName: string;
}

export function MemberManager({
  gardenId,
  members,
  userId,
  gardenName,
}: MemberManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Add member state
  const [showAddModal, setShowAddModal] = useState(false);
  const [email, setEmail] = useState("");
  const [canUpload, setCanUpload] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  // Remove member state
  const [removeTarget, setRemoveTarget] = useState<
    (GardenMember & { email: string }) | null
  >(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  // Toggle permission loading state
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleAddMember = async () => {
    if (!email.trim()) return;
    setAddLoading(true);
    setAddError("");
    try {
      await addGardenMember(gardenId, email.trim(), userId, {
        can_upload: canUpload,
        can_delete: canDelete,
      });
      setShowAddModal(false);
      setEmail("");
      setCanUpload(false);
      setCanDelete(false);
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAddLoading(false);
    }
  };

  const handleTogglePermission = async (
    targetUserId: string,
    field: "can_upload" | "can_delete",
    currentValue: boolean
  ) => {
    setTogglingId(`${targetUserId}-${field}`);
    try {
      await updateGardenMember(gardenId, targetUserId, userId, {
        [field]: !currentValue,
      });
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      alert(
        err instanceof Error ? err.message : "Failed to update permission"
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleRemoveMember = async () => {
    if (!removeTarget) return;
    setRemoveLoading(true);
    try {
      await removeGardenMember(gardenId, removeTarget.user_id, userId);
      setRemoveTarget(null);
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setRemoveLoading(false);
    }
  };

  const ownerCount = members.filter((m) => m.role === "owner").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Members</h2>
          <p className="text-base-content/60 text-sm">
            {members.length} member{members.length !== 1 && "s"} in{" "}
            <span className="font-medium">{gardenName}</span>
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAddModal(true)}
        >
          <Add size={16} />
          Add Member
        </button>
      </div>

      {/* Members Table */}
      <div className="overflow-x-auto rounded-lg border border-base-content/5">
        <table className="table">
          <thead>
            <tr className="bg-base-200/50">
              <th>Email</th>
              <th>Role</th>
              <th className="text-center">Upload</th>
              <th className="text-center">Delete</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isOwner = member.role === "owner";
              const isSelf = member.user_id === userId;

              return (
                <tr key={member.user_id} className="hover:bg-base-200/30">
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="avatar placeholder">
                        <div className="bg-neutral text-neutral-content w-8 rounded-full">
                          <span className="text-xs">
                            {member.email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="font-medium text-sm">
                          {member.email}
                        </span>
                        {isSelf && (
                          <span className="badge badge-xs badge-ghost ml-2">
                            you
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`badge badge-sm ${
                        isOwner ? "badge-primary" : "badge-ghost"
                      }`}
                    >
                      {member.role}
                    </span>
                  </td>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      className={`toggle toggle-sm toggle-success ${
                        togglingId === `${member.user_id}-can_upload`
                          ? "opacity-50"
                          : ""
                      }`}
                      checked={member.can_upload}
                      disabled={
                        isOwner ||
                        isPending ||
                        togglingId === `${member.user_id}-can_upload`
                      }
                      onChange={() =>
                        handleTogglePermission(
                          member.user_id,
                          "can_upload",
                          member.can_upload
                        )
                      }
                    />
                  </td>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      className={`toggle toggle-sm toggle-error ${
                        togglingId === `${member.user_id}-can_delete`
                          ? "opacity-50"
                          : ""
                      }`}
                      checked={member.can_delete}
                      disabled={
                        isOwner ||
                        isPending ||
                        togglingId === `${member.user_id}-can_delete`
                      }
                      onChange={() =>
                        handleTogglePermission(
                          member.user_id,
                          "can_delete",
                          member.can_delete
                        )
                      }
                    />
                  </td>
                  <td className="text-right">
                    {!isSelf && !isOwner && (
                      <button
                        className="btn btn-ghost btn-xs text-error"
                        onClick={() => setRemoveTarget(member)}
                        title="Remove member"
                      >
                        <Trash size={14} />
                      </button>
                    )}
                    {isOwner && (
                      <span className="text-xs text-base-content/40">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-base-content/40">
        Owners always have full permissions. Toggle permissions for members only.
      </p>

      {/* Add Member Modal */}
      {showAddModal && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Add Member</h3>
              <button
                className="btn btn-ghost btn-sm btn-square"
                onClick={() => {
                  setShowAddModal(false);
                  setEmail("");
                  setAddError("");
                }}
              >
                <Close size={16} />
              </button>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text">Email address</span>
              </label>
              <input
                type="email"
                className="input input-bordered w-full"
                placeholder="user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                autoFocus
              />
            </div>

            <div className="flex gap-6 mt-4">
              <label className="label cursor-pointer gap-3">
                <span className="label-text text-sm">Can upload</span>
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-success"
                  checked={canUpload}
                  onChange={(e) => setCanUpload(e.target.checked)}
                />
              </label>
              <label className="label cursor-pointer gap-3">
                <span className="label-text text-sm">Can delete</span>
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-error"
                  checked={canDelete}
                  onChange={(e) => setCanDelete(e.target.checked)}
                />
              </label>
            </div>

            {addError && (
              <div role="alert" className="alert alert-error alert-soft mt-4 text-sm">
                {addError}
              </div>
            )}

            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setShowAddModal(false);
                  setEmail("");
                  setAddError("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAddMember}
                disabled={!email.trim() || addLoading}
              >
                {addLoading ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <>
                    <Add size={16} />
                    Add
                  </>
                )}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button
              onClick={() => {
                setShowAddModal(false);
                setEmail("");
                setAddError("");
              }}
            >
              close
            </button>
          </form>
        </dialog>
      )}

      {/* Remove Confirmation Modal */}
      {removeTarget && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg">Remove Member</h3>
            <p className="py-4 text-sm">
              Remove{" "}
              <span className="font-semibold">{removeTarget.email}</span> from{" "}
              <span className="font-semibold">{gardenName}</span>? They will
              lose all access immediately.
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setRemoveTarget(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-error"
                onClick={handleRemoveMember}
                disabled={removeLoading}
              >
                {removeLoading ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <>
                    <Trash size={16} />
                    Remove
                  </>
                )}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setRemoveTarget(null)}>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
}
