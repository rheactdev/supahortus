"use client";

import React, { useState, useCallback, useTransition } from "react";
import { UppyUploader } from "./UppyUploader";
import { CreateFolderDialog } from "./CreateFolderDialog";
import {
  Folder,
  Share,
  MenuDots,
  DocumentIcon,
  Refresh,
} from "@/components/icons/liquid-glass";
import { FileCard } from "./FileCard";
import Link from "next/link";
import { Breadcrumb } from "./breadcrumb";
import { useRouter } from "next/navigation";
import {
  renameItem,
  shareFolder,
  unshareFolder,
  invalidateItemsCache,
  fetchFolderShares,
} from "@/lib/actions";
import type { Item, BreadcrumbItem } from "@/lib/data";

interface DriveExplorerProps {
  items: Item[];
  breadcrumbs: BreadcrumbItem[];
  thumbnailUrls: Record<string, string>;
  folderId: string | null;
  userId: string;
  isAdmin: boolean;
}

export function DriveExplorer({
  items,
  breadcrumbs,
  thumbnailUrls,
  folderId,
  userId,
  isAdmin,
}: DriveExplorerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // UI-only state (modals, inputs, toasts)
  const [shareModal, setShareModal] = useState<Item | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareToast, setShareToast] = useState("");
  const [currentShares, setCurrentShares] = useState<
    { user_email: string }[]
  >([]);
  const [renameModal, setRenameModal] = useState<Item | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const showToast = useCallback((msg: string) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(""), 3000);
  }, []);

  const refreshData = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router, startTransition]);

  // Fetch shares for the share modal (on-demand, not cached in page)
  const fetchShares = useCallback(async (itemId: string) => {
    try {
      const shares = await fetchFolderShares(itemId);
      setCurrentShares(shares);
    } catch {
      setCurrentShares([]);
    }
  }, []);

  const handleShareFolder = async () => {
    if (!shareModal || !shareEmail) return;
    setShareLoading(true);
    try {
      await shareFolder(shareModal.id, shareEmail, userId);
      showToast(`Shared with ${shareEmail}`);
      setShareEmail("");
      fetchShares(shareModal.id);
    } catch (err: any) {
      showToast(err.message || "Failed to share");
    } finally {
      setShareLoading(false);
    }
  };

  const handleUnshare = async (email: string) => {
    if (!shareModal) return;
    try {
      await unshareFolder(shareModal.id, email, userId);
      showToast(`Unshared with ${email}`);
      fetchShares(shareModal.id);
    } catch {
      showToast("Failed to unshare folder");
    }
  };

  const handleRename = async () => {
    if (!renameModal || !renameName.trim()) return;
    setRenameLoading(true);
    try {
      await renameItem(
        renameModal.id,
        renameName.trim(),
        userId,
        folderId
      );
      showToast(`Renamed to ${renameName.trim()}`);
      setRenameModal(null);
      setRenameName("");
      refreshData();
    } catch (err: any) {
      showToast(err.message || "Failed to rename");
    } finally {
      setRenameLoading(false);
    }
  };

  const folders = items.filter((i) => i.size === null);
  const files = items.filter((i) => i.size !== null);

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <div className="flex gap-2 items-center">
          {isAdmin && (
            <button
              className="btn btn-soft tooltip tooltip-top"
              data-tip="Sync DB with bucket"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  const res = await fetch("/api/s3/sync", { method: "POST" });
                  const data = await res.json();
                  if (data.queued) {
                    showToast("Sync queued — refreshing in a few seconds…");
                    setTimeout(() => {
                      refreshData();
                    }, 5000);
                  } else {
                    showToast(data.error || "Sync failed");
                  }
                } catch {
                  showToast("Sync failed");
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {syncing ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Refresh size={16} />
              )}
            </button>
          )}
          <CreateFolderDialog
            breadcrumbs={breadcrumbs}
            isAdmin={isAdmin}
            parentId={folderId}
            userId={userId}
            onSuccess={refreshData}
          />
          <UppyUploader
            parentId={folderId}
            userId={userId}
            onUploadSuccess={refreshData}
          />
        </div>
      </div>

      <div className="overflow-hidden min-h-[50vh] flex flex-col">
        {isPending ? (
          <div className="w-full h-100 flex justify-center items-center">
            <div className="loading loading-ring loading-lg h-48 w-48" />
          </div>
        ) : folders.length === 0 && files.length === 0 ? (
          <div className="flex flex-col flex-1 justify-center items-center text-base-content/40 gap-4 min-h-[400px]">
            <Folder size={64} className="opacity-20" />
            <p className="font-semibold text-lg">No files or folders here</p>
            <p className="text-sm">Upload something to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 box">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="card bg-base-200/50 hover:bg-base-300/60 border border-base-content/5 hover:border-primary/30 group active:scale-95 relative overflow-visible"
              >
                {isAdmin && (
                  <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <details className="dropdown dropdown-end">
                      <summary className="btn btn-sm btn-square btn-soft shadow-sm">
                        <MenuDots size={18} />
                      </summary>
                      <ul className="dropdown-content menu bg-base-100 rounded-box z-[20] w-48 p-2 shadow-2xl border border-base-content/10 mt-1">
                        <li>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setRenameModal(folder);
                              setRenameName(folder.name);
                            }}
                          >
                            <DocumentIcon
                              size={16}
                              className="text-warning"
                            />{" "}
                            Rename
                          </button>
                        </li>
                        <li>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShareModal(folder);
                              fetchShares(folder.id);
                            }}
                          >
                            <Share size={16} className="text-info" /> Share
                            Folder
                          </button>
                        </li>
                      </ul>
                    </details>
                  </div>
                )}

                <Link
                  href={`/dashboard?folder=${folder.id}`}
                  className="card-body flex flex-col justify-center items-center gap-3"
                >
                  <div className="p-3 bg-secondary/10 rounded-lg text-secondary group-hover:bg-secondary group-hover:text-secondary-content">
                    <Folder size={32} className="opacity-80" />
                  </div>
                  <span
                    className="font-semibold truncate text-sm"
                    title={folder.name}
                  >
                    {folder.name}
                  </span>
                </Link>
              </div>
            ))}

            {files.map((file) => (
              <FileCard
                key={file.id}
                item={file}
                thumbnailUrl={thumbnailUrls[file.id]}
                userId={userId}
                folderId={folderId}
                onRefresh={refreshData}
              />
            ))}
          </div>
        )}
      </div>

      {renameModal && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-xl mb-4">Rename</h3>
            <input
              type="text"
              className="input input-bordered w-full"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              autoFocus
            />
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setRenameModal(null);
                  setRenameName("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRename}
                disabled={
                  !renameName.trim() ||
                  renameName.trim() === renameModal.name ||
                  renameLoading
                }
              >
                {renameLoading ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  "Rename"
                )}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button
              onClick={() => {
                setRenameModal(null);
                setRenameName("");
              }}
            >
              close
            </button>
          </form>
        </dialog>
      )}

      {shareModal && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-xl mb-1">Share Folder</h3>
            <p className="text-sm text-base-content/60 mb-6">
              Share <strong>{shareModal.name}</strong> with other users.
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="user@example.com"
                  className="input input-bordered flex-1"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleShareFolder()
                  }
                />
                <button
                  className="btn btn-primary"
                  onClick={handleShareFolder}
                  disabled={!shareEmail || shareLoading}
                >
                  {shareLoading ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    "Share"
                  )}
                </button>
              </div>

              <div className="divider text-xs opacity-30 mt-2 mb-0 uppercase tracking-widest font-bold">
                Currently Shared With
              </div>

              <div className="min-h-[100px] max-h-[200px] overflow-y-auto flex flex-col gap-2 py-2">
                {currentShares.length === 0 ? (
                  <div className="text-center py-4 text-sm text-base-content/30 italic">
                    Not shared with anyone yet
                  </div>
                ) : (
                  currentShares.map((share) => (
                    <div
                      key={share.user_email}
                      className="flex justify-between items-center p-2 rounded-lg bg-base-200/50 group"
                    >
                      <span
                        className="text-sm font-medium truncate flex-1 pr-2"
                        title={share.user_email}
                      >
                        {share.user_email}
                      </span>
                      <button
                        className="btn btn-ghost btn-xs text-error hover:bg-error/10"
                        onClick={() => handleUnshare(share.user_email)}
                      >
                        Unshare
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="modal-action">
              <button
                className="btn btn-ghost btn-block"
                onClick={() => {
                  setShareModal(null);
                  setShareEmail("");
                }}
              >
                Close
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button
              onClick={() => {
                setShareModal(null);
                setShareEmail("");
              }}
            >
              close
            </button>
          </form>
        </dialog>
      )}

      {shareToast && (
        <div className="toast toast-end z-50">
          <div className="alert alert-info shadow-lg font-medium text-sm">
            <span>{shareToast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
