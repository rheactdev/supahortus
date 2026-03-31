"use client";

import React, { useState, useEffect, useCallback } from "react";
import { UppyUploader } from "./UppyUploader";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { Folder, Share, MenuDots } from "@/components/icons/liquid-glass";
import { FileCard } from "./FileCard";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Breadcrumb } from "./breadcrumb";

type S3File = {
  key: string;
  size: number;
  lastModified: string;
};

export function DriveExplorer() {
  const searchParams = useSearchParams();
  const prefix = searchParams.get("prefix") || "";
  const [folders, setFolders] = useState<string[]>([]);
  const [files, setFiles] = useState<S3File[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [shareModal, setShareModal] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareToast, setShareToast] = useState("");
  const [currentShares, setCurrentShares] = useState<{ user_email: string }[]>([]);

  // Fetch admin status
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setIsAdmin(d.isAdmin === true))
      .catch(() => setIsAdmin(false));
  }, []);

  const fetchContents = useCallback(async (currentPrefix: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/s3/list?prefix=${encodeURIComponent(currentPrefix)}`);
      const data = await res.json();
      if (!data.error) {
        setFolders(data.folders || []);
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error("Failed to fetch", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContents(prefix);
  }, [prefix, fetchContents]);

  const fetchShares = useCallback(async (folderPrefix: string) => {
    try {
      const res = await fetch(`/api/s3/folder/share?folderPrefix=${encodeURIComponent(folderPrefix)}`);
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
      fetchShares(shareModal);
    }
  }, [shareModal, fetchShares]);

  const handleShareFolder = async () => {
    if (!shareModal || !shareEmail) return;
    setShareLoading(true);
    try {
      const res = await fetch("/api/s3/folder/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderPrefix: shareModal, email: shareEmail }),
      });
      const data = await res.json();
      if (data.success) {
        setShareToast(`Shared with ${shareEmail}`);
        setTimeout(() => setShareToast(""), 3000);
        setShareEmail("");
        fetchShares(shareModal); // Refresh list
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
      const res = await fetch(`/api/s3/folder/share?folderPrefix=${encodeURIComponent(shareModal)}&email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setShareToast(`Unshared with ${email}`);
        setTimeout(() => setShareToast(""), 3000);
        fetchShares(shareModal); // Refresh list
      } else {
        setShareToast(data.error || "Failed to unshare");
        setTimeout(() => setShareToast(""), 3000);
      }
    } catch {
      setShareToast("Failed to unshare folder");
      setTimeout(() => setShareToast(""), 3000);
    }
  };

  const breadcrumbs = prefix.split("/").filter(Boolean);

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Breadcrumb breadcrumbs={breadcrumbs} />
        <div className="flex gap-2 items-center">
          <CreateFolderDialog prefix={prefix} onSuccess={() => fetchContents(prefix)} />
          <UppyUploader prefix={prefix} onUploadSuccess={() => fetchContents(prefix)} />
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
            {folders.map((fGroup) => {
              const folderName = fGroup.endsWith("/") ? fGroup.slice(0, -1).split("/").pop() : fGroup;
              return (
                <div key={fGroup} className="card bg-base-200/50 hover:bg-base-300/60 border border-base-content/5 hover:border-primary/30 group active:scale-95 relative overflow-visible">
                  {/* Admin share button on hover */}
                  {isAdmin && (
                    <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <details className="dropdown dropdown-end">
                        <summary className="btn btn-sm btn-square btn-soft shadow-sm">
                          <MenuDots size={18} />
                        </summary>
                        <ul className="dropdown-content menu bg-base-100 rounded-box z-[20] w-48 p-2 shadow-2xl border border-base-content/10 mt-1">
                          <li>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShareModal(fGroup); }}>
                              <Share size={16} className="text-info" /> Share Folder
                            </button>
                          </li>
                        </ul>
                      </details>
                    </div>
                  )}

                  <Link
                    href={`/dashboard?prefix=${encodeURIComponent(fGroup)}`}
                    className="card-body flex flex-col justify-center items-center gap-3"
                  >
                    <div className="p-3 bg-secondary/10 rounded-lg text-secondary group-hover:bg-secondary group-hover:text-secondary-content">
                      <Folder size={32} className="opacity-80" />
                    </div>
                    <span className="font-semibold truncate text-sm" title={folderName}>{folderName}</span>
                  </Link>
                </div>
              );
            })}

            {files.map((file) => (
              <FileCard
                key={file.key}
                file={file}
                prefix={prefix}
                onRefresh={() => fetchContents(prefix)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Share Folder Modal */}
      {shareModal && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-xl mb-1">Share Folder</h3>
            <p className="text-sm text-base-content/60 mb-6">
              Share <strong>{shareModal.endsWith("/") ? shareModal.slice(0, -1).split("/").pop() : shareModal}</strong> with other users.
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

      {/* Toast */}
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
