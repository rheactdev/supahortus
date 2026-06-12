"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addGardenMember,
  generateGardenPublicLink,
  updateGardenMember,
  updateGardenPublicLink,
  removeGardenMember,
} from "@/lib/actions";
import type { GardenMember, GardenPublicLink } from "@/lib/data";
import {
  Add,
  Trash,
  Close,
  Refresh,
  Share,
} from "@/components/icons/liquid-glass";

interface MemberManagerProps {
  gardenId: string;
  members: (GardenMember & { email: string })[];
  userId: string;
  gardenName: string;
  publicLink: GardenPublicLink | null;
}

export function MemberManager({
  gardenId,
  members,
  userId,
  gardenName,
  publicLink,
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
  const [publicAccess, setPublicAccess] =
    useState<GardenPublicLink | null>(publicLink);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicMessage, setPublicMessage] = useState("");

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

  const handleGeneratePublicLink = async () => {
    setPublicLoading(true);
    setPublicMessage("");
    try {
      const link = await generateGardenPublicLink(gardenId, userId);
      setPublicAccess(link as GardenPublicLink);
      const url = `${window.location.origin}/public/g/${link.token}`;
      await navigator.clipboard.writeText(url);
      setPublicMessage("Public link copied");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to generate link");
    } finally {
      setPublicLoading(false);
    }
  };

  const handlePublicToggle = async (
    field: "enabled" | "can_upload" | "can_delete",
    currentValue: boolean,
  ) => {
    if (!publicAccess) return;
    setTogglingId(`public-${field}`);
    try {
      const link = await updateGardenPublicLink(gardenId, userId, {
        [field]: !currentValue,
      });
      setPublicAccess(link as GardenPublicLink);
    } catch (err) {
      alert(
        err instanceof Error ? err.message : "Failed to update public access",
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleCopyPublicLink = async () => {
    if (!publicAccess) return;
    const url = `${window.location.origin}/public/g/${publicAccess.token}`;
    await navigator.clipboard.writeText(url);
    setPublicMessage("Public link copied");
  };

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
              <th className="text-center">View</th>
              <th className="text-center">Upload</th>
              <th className="text-center">Delete</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-info/5 hover:bg-info/10">
              <td>
                <div className="flex items-center gap-2">
                  <div className="avatar placeholder">
                    <div className="bg-info text-info-content w-8 rounded-full">
                      <Share size={14} />
                    </div>
                  </div>
                  <div>
                    <span className="font-medium text-sm">Public</span>
                    <p className="text-xs text-base-content/45">
                      Anyone with the link
                    </p>
                  </div>
                </div>
              </td>
              <td>
                <span className="badge badge-sm badge-info">public</span>
              </td>
              <td className="text-center">
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-info"
                  checked={publicAccess?.enabled ?? false}
                  disabled={
                    !publicAccess ||
                    publicLoading ||
                    togglingId === "public-enabled"
                  }
                  onChange={() =>
                    handlePublicToggle(
                      "enabled",
                      publicAccess?.enabled ?? false,
                    )
                  }
                  title="Allow public viewing"
                />
              </td>
              <td className="text-center">
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-success"
                  checked={publicAccess?.can_upload ?? false}
                  disabled={
                    !publicAccess ||
                    publicLoading ||
                    togglingId === "public-can_upload"
                  }
                  onChange={() =>
                    handlePublicToggle(
                      "can_upload",
                      publicAccess?.can_upload ?? false,
                    )
                  }
                  title="Allow public uploads"
                />
              </td>
              <td className="text-center">
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-error"
                  checked={publicAccess?.can_delete ?? false}
                  disabled={
                    !publicAccess ||
                    publicLoading ||
                    togglingId === "public-can_delete"
                  }
                  onChange={() =>
                    handlePublicToggle(
                      "can_delete",
                      publicAccess?.can_delete ?? false,
                    )
                  }
                  title="Allow public deletion"
                />
              </td>
              <td className="text-right">
                {publicAccess ? (
                  <div className="inline-flex items-center gap-1">
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={handleCopyPublicLink}
                      title="Copy public link"
                    >
                      <Share size={14} />
                    </button>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={handleGeneratePublicLink}
                      disabled={publicLoading}
                      title="Generate a new link"
                    >
                      {publicLoading ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        <Refresh size={14} />
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-info btn-xs"
                    onClick={handleGeneratePublicLink}
                    disabled={publicLoading}
                  >
                    {publicLoading ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <Share size={14} />
                    )}
                    Generate link
                  </button>
                )}
              </td>
            </tr>
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
                      className="toggle toggle-sm toggle-info"
                      checked
                      disabled
                      title="Members can always view"
                    />
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
        Owners always have full permissions. Generating a new public link
        revokes the previous link and its active visitors.
      </p>

      {publicMessage && (
        <div className="toast toast-end z-50">
          <div className="alert alert-success text-sm">
            <span>{publicMessage}</span>
          </div>
        </div>
      )}

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
