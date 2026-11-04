"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  addGardenMember,
  generateGardenPublicLink,
  removeGardenMember,
  updateGardenMember,
  updateGardenPublicLink,
} from "@/lib/actions";
import type { GardenMember, GardenPublicLink } from "@/lib/data";
import { Add } from "../icons/liquid-glass";

type Member = GardenMember & { email: string };
type MemberPermission = "can_upload" | "can_delete";
type PublicPermission = "enabled" | MemberPermission;

interface MemberManagerProps {
  gardenId: string;
  members: Member[];
  userId: string;
  gardenName: string;
  publicLink: GardenPublicLink | null;
}

const memberPermissions = [
  { field: "can_upload", label: "Upload" },
  { field: "can_delete", label: "Delete files" },
] as const;

const publicPermissions = [
  { field: "enabled", label: "Allow viewing" },
  { field: "can_upload", label: "Allow uploads" },
  { field: "can_delete", label: "Allow file deletion" },
] as const;

export function MemberManager({ gardenId, members, userId, gardenName, publicLink }: MemberManagerProps) {
  const router = useRouter();
  const addButton = useRef<HTMLButtonElement>(null);
  const addDialog = useRef<HTMLDialogElement>(null);
  const removeDialog = useRef<HTMLDialogElement>(null);
  const removeButton = useRef<HTMLButtonElement | null>(null);
  const removedMember = useRef(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [dialogError, setDialogError] = useState("");
  const [permissionError, setPermissionError] = useState("");
  const [status, setStatus] = useState("");
  const [pendingAction, setPendingAction] = useState("");
  const [refreshing, startTransition] = useTransition();
  const busy = Boolean(pendingAction) || refreshing;

  function refreshMembers(message: string) {
    setStatus(message);
    startTransition(() => router.refresh());
  }

  function openAddDialog() {
    setDialogError("");
    addDialog.current?.querySelector("form")?.reset();
    addDialog.current?.showModal();
  }

  function openRemoveDialog(member: Member, trigger: HTMLButtonElement) {
    removeButton.current = trigger;
    setDialogError("");
    setRemoveTarget(member);
    removeDialog.current?.showModal();
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (!email) return;

    setPendingAction("add");
    setDialogError("");
    try {
      const result = await addGardenMember(gardenId, email, userId, {
        can_upload: form.has("can_upload"),
        can_delete: form.has("can_delete"),
      });
      if (result.error) {
        setDialogError(result.error);
        return;
      }
      addDialog.current?.close();
      refreshMembers("Member added.");
    } catch {
      setDialogError("Could not add the member. Try again.");
    } finally {
      setPendingAction("");
    }
  }

  async function handleRemove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!removeTarget || busy) return;

    setPendingAction("remove");
    setDialogError("");
    try {
      await removeGardenMember(gardenId, removeTarget.user_id, userId);
      removedMember.current = true;
      removeDialog.current?.close();
      refreshMembers("Member removed.");
    } catch {
      setDialogError("Could not remove the member. Try again.");
    } finally {
      setPendingAction("");
    }
  }

  async function changePermission(member: Member, field: MemberPermission) {
    if (busy) return;

    setPendingAction(`${member.user_id}-${field}`);
    setPermissionError("");
    setStatus("");
    try {
      await updateGardenMember(gardenId, member.user_id, userId, { [field]: !member[field] });
      refreshMembers("Member permission updated.");
    } catch {
      setPermissionError("Could not update the member permission. Try again.");
    } finally {
      setPendingAction("");
    }
  }

  return (
    <>
      <section aria-labelledby="garden-members" className="mt-8 min-w-0 pb-6">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="garden-members" className="text-lg font-semibold">Members</h2>
            <button ref={addButton} type="button" className="btn btn-primary btn-sm" onClick={openAddDialog}>
              <Add size={16} /> Add Member
            </button>
          </div>

          {members.length === 0 ? (
            <p className="text-sm text-base-content/75">No members to show.</p>
          ) : (
            <div className="max-w-full overflow-x-auto rounded-box border border-base-content/10">
              <table className="table table-sm" aria-labelledby="garden-members">
                <thead>
                  <tr className="bg-base-200/50">
                    <th scope="col">Member</th>
                    <th scope="col">Role</th>
                    <th scope="col">View</th>
                    {memberPermissions.map(({ field, label }) => (
                      <th key={field} scope="col">{label}</th>
                    ))}
                    <th scope="col" className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const owner = member.role === "owner";
                    const self = member.user_id === userId;
                    const label = member.email || member.user_id;

                    return (
                      <tr key={member.user_id}>
                        <th scope="row" className="font-medium">
                          <div className="flex items-center gap-2">
                            <div className="avatar avatar-placeholder shrink-0" aria-hidden="true">
                              <div className="w-8 rounded-full bg-base-300 text-base-content">
                                <span className="text-xs">{member.email.charAt(0).toUpperCase() || "?"}</span>
                              </div>
                            </div>
                            <span className="max-w-64 wrap-anywhere">{label}</span>
                            {self && <span className="badge badge-ghost badge-xs">You</span>}
                          </div>
                        </th>
                        <td><span className="badge badge-ghost badge-sm">{member.role}</span></td>
                        <td>Allowed</td>
                        {memberPermissions.map(({ field, label: permission }) => (
                          <td key={field}>
                            {owner ? "Allowed" : (
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="toggle toggle-sm"
                                  aria-label={`${permission} for ${label}`}
                                  checked={member[field]}
                                  disabled={busy}
                                  onChange={() => changePermission(member, field)}
                                />
                                {pendingAction === `${member.user_id}-${field}` && (
                                  <span role="status" className="text-xs">Saving…</span>
                                )}
                              </label>
                            )}
                          </td>
                        ))}
                        <td className="text-right">
                          {!owner && !self && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              aria-label={`Remove ${label}`}
                              onClick={(event) => openRemoveDialog(member, event.currentTarget)}
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {status && <p role="status" className="text-sm text-success">{status}</p>}
          {permissionError && <p role="alert" className="text-sm text-error">{permissionError}</p>}
        </div>

        <dialog
          ref={addDialog}
          className="modal"
          aria-labelledby="add-member-title"
          onClose={() => addButton.current?.focus()}
          onCancel={(event) => {
            if (pendingAction === "add") event.preventDefault();
          }}
        >
          <div className="modal-box">
            <h3 id="add-member-title" className="text-lg font-bold">Add member</h3>
            <form onSubmit={handleAdd} className="mt-4">
              <fieldset className="fieldset gap-3" disabled={pendingAction === "add"}>
                <label htmlFor="garden-member-email" className="label text-base-content">Email address</label>
                <input id="garden-member-email" name="email" type="email" className="input w-full" required autoFocus />
                {memberPermissions.map(({ field, label }) => (
                  <label key={field} className="label w-fit text-base-content">
                    <input type="checkbox" name={field} className="toggle toggle-sm" />
                    {label}
                  </label>
                ))}
              </fieldset>
              {dialogError && <p role="alert" className="mt-2 text-sm text-error">{dialogError}</p>}
              <div className="modal-action">
                <button type="button" className="btn" disabled={pendingAction === "add"} onClick={() => addDialog.current?.close()}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {pendingAction === "add" ? "Adding…" : "Add member"}
                </button>
              </div>
            </form>
          </div>
        </dialog>

        <dialog
          ref={removeDialog}
          className="modal"
          aria-labelledby="remove-member-title"
          onCancel={(event) => {
            if (pendingAction === "remove") event.preventDefault();
          }}
          onClose={() => {
            const trigger = removeButton.current;
            if (removedMember.current || !trigger?.isConnected) {
              addButton.current?.focus();
            } else {
              trigger.focus();
            }
            removedMember.current = false;
            removeButton.current = null;
            setRemoveTarget(null);
          }}
        >
          <div className="modal-box">
            <h3 id="remove-member-title" className="text-lg font-bold">Remove member?</h3>
            <p className="mt-2 wrap-anywhere text-sm">
              <strong>{removeTarget?.email || removeTarget?.user_id}</strong> will lose member access to <strong>{gardenName}</strong>.
            </p>
            {dialogError && <p role="alert" className="mt-2 text-sm text-error">{dialogError}</p>}
            <form onSubmit={handleRemove} className="modal-action">
              <button type="button" className="btn" disabled={pendingAction === "remove"} onClick={() => removeDialog.current?.close()} autoFocus>
                Cancel
              </button>
              <button type="submit" className="btn btn-error" disabled={busy}>
                {pendingAction === "remove" ? "Removing…" : "Remove member"}
              </button>
            </form>
          </div>
        </dialog>
      </section>
      <PublicSharing gardenId={gardenId} userId={userId} publicLink={publicLink} />
    </>
  );
}

function PublicSharing({ gardenId, userId, publicLink }: Pick<MemberManagerProps, "gardenId" | "userId" | "publicLink">) {
  const replaceDialog = useRef<HTMLDialogElement>(null);
  const [link, setLink] = useState(publicLink);
  const [pending, setPending] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [replaceError, setReplaceError] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const path = link ? `/public/g/${link.token}` : "";

  async function copyLink(linkPath: string) {
    const url = new URL(linkPath, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setManualUrl("");
      setStatus("Public link copied.");
    } catch {
      setManualUrl(url);
    }
  }

  async function saveLink() {
    if (pending) return;

    setPending("link");
    setStatus("");
    setError("");
    setReplaceError("");
    setManualUrl("");
    try {
      const saved = await generateGardenPublicLink(gardenId, userId);
      setLink(saved);
      replaceDialog.current?.close();
      setStatus(link ? "Public link replaced." : "Public link generated.");
      await copyLink(`/public/g/${saved.token}`);
    } catch {
      if (link) {
        setReplaceError("Could not replace the public link. Try again.");
      } else {
        setError("Could not generate the public link. Try again.");
      }
    } finally {
      setPending("");
    }
  }

  async function handleCopy() {
    if (pending) return;

    setPending("copy");
    setError("");
    setStatus("");
    try {
      await copyLink(path);
    } finally {
      setPending("");
    }
  }

  async function changePermission(field: PublicPermission) {
    if (!link || pending) return;

    setPending(field);
    setError("");
    setStatus("");
    try {
      const saved = await updateGardenPublicLink(gardenId, userId, { [field]: !link[field] });
      setLink(saved);
      setStatus("Public sharing updated.");
    } catch {
      setError("Could not update public sharing. Try again.");
    } finally {
      setPending("");
    }
  }

  return (
    <section aria-labelledby="garden-public-sharing" className="grid min-w-0 gap-4 py-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
      <div>
        <h2 id="garden-public-sharing" className="text-lg font-semibold">Public sharing</h2>
        <p className="mt-1 text-sm text-base-content/75">
          {link
            ? "Anyone with the link can access this garden when public viewing is enabled."
            : "Generate a link to share this garden with anyone who has the link."}
        </p>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-3">
        <span className="badge badge-ghost badge-sm">
          {link ? (link.enabled ? "Enabled" : "Disabled") : "No link"}
        </span>
        {link ? (
          <>
            <fieldset className="fieldset gap-2">
              <legend className="fieldset-legend">Link permissions</legend>
              {publicPermissions.map(({ field, label }) => (
                <label key={field} className="label w-fit text-base-content">
                  <input
                    type="checkbox"
                    className="toggle toggle-sm"
                    checked={link[field]}
                    disabled={Boolean(pending)}
                    onChange={() => changePermission(field)}
                  />
                  {label}
                  {pending === field && <span role="status">Saving…</span>}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-sm"
                disabled={Boolean(pending)}
                onClick={handleCopy}
              >
                {pending === "copy" ? "Copying…" : "Copy link"}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                aria-disabled={Boolean(pending)}
                onClick={() => {
                  if (pending) return;
                  setReplaceError("");
                  replaceDialog.current?.showModal();
                }}
              >
                Replace link
              </button>
            </div>
          </>
        ) : (
          <div>
            <button type="button" className="btn btn-outline btn-sm" disabled={Boolean(pending)} onClick={saveLink}>
              {pending ? "Generating…" : "Generate link"}
            </button>
          </div>
        )}
        {status && <p role="status" className="text-sm text-success">{status}</p>}
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
        {manualUrl && (
          <div className="fieldset w-full min-w-0">
            <label htmlFor="garden-public-url" className="label text-base-content">Public link</label>
            <input id="garden-public-url" className="input w-full" readOnly value={manualUrl} />
            <p role="status" className="text-sm">Could not copy automatically. Select and copy the link above.</p>
          </div>
        )}
      </div>

      <dialog
        ref={replaceDialog}
        className="modal"
        aria-labelledby="replace-link-title"
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <div className="modal-box">
          <h3 id="replace-link-title" className="text-lg font-bold">Replace public link?</h3>
          <p className="mt-2 text-sm">
            Replacing the link enables public sharing and revokes the previous link and access for its active visitors.
          </p>
          {replaceError && <p role="alert" className="mt-2 text-sm text-error">{replaceError}</p>}
          <div className="modal-action">
            <button type="button" className="btn" disabled={Boolean(pending)} onClick={() => replaceDialog.current?.close()} autoFocus>
              Cancel
            </button>
            <button type="button" className="btn btn-error" disabled={Boolean(pending)} onClick={saveLink}>
              {pending ? "Replacing…" : "Replace link"}
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
