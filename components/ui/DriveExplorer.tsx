"use client";

import React, { useState, useCallback, useTransition } from "react";
import { UppyUploader } from "./UppyUploader";
import { CreateFolderDialog } from "./CreateFolderDialog";
import {
  Folder,
  MenuDots,
  DocumentIcon,
} from "@/components/icons/liquid-glass";
import { FileCard } from "./FileCard";
import Link from "next/link";
import { Breadcrumb } from "./breadcrumb";
import { useRouter } from "next/navigation";
import { renameItem } from "@/lib/actions";
import type { Item, BreadcrumbItem } from "@/lib/data";

interface DriveExplorerProps {
  items: Item[];
  breadcrumbs: BreadcrumbItem[];
  thumbnailUrls: Record<string, string>;
  folderId: string | null;
  gardenId: string;
  userId: string;
  canUpload: boolean;
  canDelete: boolean;
  role: string;
}

export function DriveExplorer({
  items,
  breadcrumbs,
  thumbnailUrls,
  folderId,
  gardenId,
  userId,
  canUpload,
  canDelete,
  role,
}: DriveExplorerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [toast, setToast] = useState("");
  const [renameModal, setRenameModal] = useState<Item | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  const refreshData = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router, startTransition]);

  const handleRename = async () => {
    if (!renameModal || !renameName.trim()) return;
    setRenameLoading(true);
    try {
      await renameItem(
        renameModal.id,
        renameName.trim(),
        gardenId,
        userId
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

  const folders = items.filter((i) => i.type === "folder");
  const files = items.filter((i) => i.type === "file");

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Breadcrumb breadcrumbs={breadcrumbs} gardenId={gardenId} />
        <div className="flex gap-2 items-center">
          {canUpload && (
            <>
              <CreateFolderDialog
                gardenId={gardenId}
                parentId={folderId}
                userId={userId}
                onSuccess={refreshData}
              />
              <UppyUploader
                gardenId={gardenId}
                parentId={folderId}
                userId={userId}
                onUploadSuccess={refreshData}
              />
            </>
          )}
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
                {canUpload && (
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
                      </ul>
                    </details>
                  </div>
                )}

                <Link
                  href={`/dashboard/garden/${gardenId}?folder=${folder.id}`}
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
                gardenId={gardenId}
                userId={userId}
                folderId={folderId}
                canUpload={canUpload}
                canDelete={canDelete}
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

      {toast && (
        <div className="toast toast-end z-50">
          <div className="alert alert-info shadow-lg font-medium text-sm">
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
