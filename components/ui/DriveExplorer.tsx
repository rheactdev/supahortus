"use client";

import React, { useState, useEffect, useCallback } from "react";
import { UppyUploader } from "./UppyUploader";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { Folder, Share, MenuDots, DocumentIcon, Database } from "@/components/icons/liquid-glass";
import { FileCard } from "./FileCard";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Breadcrumb } from "./breadcrumb";

type Item = {
  id: string;
  parent_id: string | null;
  name: string;
  size: number | null;
  mime_type: string | null;
  s3_key: string;
  created_at: string;
};

type BreadcrumbItem = {
  id: string;
  name: string;
};

export function DriveExplorer() {
  const searchParams = useSearchParams();
  const folderId = searchParams.get("folder") || null;
  const [items, setItems] = useState<Item[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [shareModal, setShareModal] = useState<Item | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareToast, setShareToast] = useState("");
  const [currentShares, setCurrentShares] = useState<{ user_email: string }[]>([]);
  const [renameModal, setRenameModal] = useState<Item | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.isAdmin === true))
      .catch(() => setIsAdmin(false));
  }, []);

  const fetchContents = useCallback(async (parentId: string | null) => {
    setLoading(true);
    try {
      const url = parentId
        ? `/api/s3/list?parent=${encodeURIComponent(parentId)}`
        : `/api/s3/list`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.error) {
        setItems(data.items || []);
        setBreadcrumbs(data.breadcrumbs || []);
      }
    } catch (err) {
      console.error("Failed to fetch", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContents(folderId);
  }, [folderId, fetchContents]);

  const fetchShares = useCallback(async (itemId: string) => {
    try {
      const res = await fetch(`/api/s3/folder/share?itemId=${encodeURIComponent(itemId)}`);
      const data = await res.json();
      if (!data.error) {
        setCurrentShares(data.shares || []);
      }
    } catch (err) {
      console.error("Failed to fetch shares", err);
    }
  }, []);

  useEffect(() => {
    if (shareModal) {
      fetchShares(shareModal.id);
    }
  }, [shareModal, fetchShares]);

  const handleShareFolder = async () => {
    if (!shareModal || !shareEmail) return;
    setShareLoading(true);
    try {
      const res = await fetch("/api/s3/folder/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: shareModal.id, email: shareEmail }),
      });
      const data = await res.json();
      if (data.success) {
        setShareToast(`Shared with ${shareEmail}`);
        setTimeout(() => setShareToast(""), 3000);
        setShareEmail("");
        fetchShares(shareModal.id);
      } else {
        setShareToast(data.error || "Failed to share");
        setTimeout(() => setShareToast(""), 3000);
      }
    } catch {
      setShareToast("Failed to share folder");
      setTimeout(() => setShareToast(""), 3000);
    } finally {
      setShareLoading(false);
    }
  };

  const handleUnshare = async (email: string) => {
    if (!shareModal) return;
    try {
      const res = await fetch(`/api/s3/folder/share?itemId=${encodeURIComponent(shareModal.id)}&email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setShareToast(`Unshared with ${email}`);
        setTimeout(() => setShareToast(""), 3000);
        fetchShares(shareModal.id);
      } else {
        setShareToast(data.error || "Failed to unshare");
        setTimeout(() => setShareToast(""), 3000);
      }
    } catch {
      setShareToast("Failed to unshare folder");
      setTimeout(() => setShareToast(""), 3000);
    }
  };

  const handleRename = async () => {
    if (!renameModal || !renameName.trim()) return;
    setRenameLoading(true);
    try {
      const res = await fetch("/api/s3/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: renameModal.id, newName: renameName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setShareToast(`Renamed to ${renameName.trim()}`);
        setTimeout(() => setShareToast(""), 3000);
        setRenameModal(null);
        setRenameName("");
        fetchContents(folderId);
      } else {
        setShareToast(data.error || "Failed to rename");
        setTimeout(() => setShareToast(""), 3000);
      }
    } catch {
      setShareToast("Failed to rename");
      setTimeout(() => setShareToast(""), 3000);
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
              className="btn btn-soft btn-sm tooltip tooltip-bottom"
              data-tip="Sync DB with bucket"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  const res = await fetch("/api/s3/sync", { method: "POST" });
                  const data = await res.json();
                  if (data.queued) {
                    setShareToast("Sync queued — refreshing in a few seconds…");
                    setTimeout(() => {
                      fetchContents(folderId);
                      setShareToast("");
                    }, 5000);
                  } else {
                    setShareToast(data.error || "Sync failed");
                    setTimeout(() => setShareToast(""), 3000);
                  }
                } catch {
                  setShareToast("Sync failed");
                  setTimeout(() => setShareToast(""), 3000);
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {syncing ? <span className="loading loading-spinner loading-xs" /> : <Database size={16} />}
            </button>
          )}
          <CreateFolderDialog parentId={folderId} onSuccess={() => fetchContents(folderId)} />
          <UppyUploader parentId={folderId} onUploadSuccess={() => fetchContents(folderId)} />
        </div>
      </div>

      <div className="overflow-hidden min-h-[50vh] flex flex-col">
        {loading ? (
          <div className="w-full h-100 flex justify-center items-center">
            <div className="loading loading-ring loading-lg h-48 w-48"></div>
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
              <div key={folder.id} className="card bg-base-200/50 hover:bg-base-300/60 border border-base-content/5 hover:border-primary/30 group active:scale-95 relative overflow-visible">
                {isAdmin && (
                  <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <details className="dropdown dropdown-end">
                      <summary className="btn btn-sm btn-square btn-soft shadow-sm">
                        <MenuDots size={18} />
                      </summary>
                      <ul className="dropdown-content menu bg-base-100 rounded-box z-[20] w-48 p-2 shadow-2xl border border-base-content/10 mt-1">
                        <li>
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setRenameModal(folder); setRenameName(folder.name); }}>
                            <DocumentIcon size={16} className="text-warning" /> Rename
                          </button>
                        </li>
                        <li>
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShareModal(folder); }}>
                            <Share size={16} className="text-info" /> Share Folder
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
                  <span className="font-semibold truncate text-sm" title={folder.name}>{folder.name}</span>
                </Link>
              </div>
            ))}

            {files.map((file) => (
              <FileCard
                key={file.id}
                item={file}
                onRefresh={() => fetchContents(folderId)}
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
              <button className="btn btn-ghost" onClick={() => { setRenameModal(null); setRenameName(""); }}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRename}
                disabled={!renameName.trim() || renameName.trim() === renameModal.name || renameLoading}
              >
                {renameLoading ? <span className="loading loading-spinner loading-sm" /> : "Rename"}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => { setRenameModal(null); setRenameName(""); }}>close</button>
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
                  onKeyDown={(e) => e.key === "Enter" && handleShareFolder()}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleShareFolder}
                  disabled={!shareEmail || shareLoading}
                >
                  {shareLoading ? <span className="loading loading-spinner loading-sm" /> : "Share"}
                </button>
              </div>

              <div className="divider text-xs opacity-30 mt-2 mb-0 uppercase tracking-widest font-bold">Currently Shared With</div>

              <div className="min-h-[100px] max-h-[200px] overflow-y-auto flex flex-col gap-2 py-2">
                {currentShares.length === 0 ? (
                  <div className="text-center py-4 text-sm text-base-content/30 italic">Not shared with anyone yet</div>
                ) : (
                  currentShares.map((share) => (
                    <div key={share.user_email} className="flex justify-between items-center p-2 rounded-lg bg-base-200/50 group">
                      <span className="text-sm font-medium truncate flex-1 pr-2" title={share.user_email}>
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
              <button className="btn btn-ghost btn-block" onClick={() => { setShareModal(null); setShareEmail(""); }}>
                Close
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => { setShareModal(null); setShareEmail(""); }}>close</button>
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
