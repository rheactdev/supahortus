"use client";

import React, { useState, useCallback, useTransition, useEffect } from "react";
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
  gardenSlug: string;
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
  gardenSlug,
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

  const [viewConfig, setViewConfig] = useState<{cardSize: number; imageFit: "cover"|"contain"; aspectRatio: number}>({
    cardSize: 200,
    imageFit: "contain",
    aspectRatio: 1,
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const key = `view-config-${folderId || gardenId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setViewConfig(JSON.parse(saved));
      } catch (e) {}
    }
  }, [folderId, gardenId]);

  const updateConfig = (updates: Partial<typeof viewConfig>) => {
    const newConfig = { ...viewConfig, ...updates };
    setViewConfig(newConfig);
    localStorage.setItem(`view-config-${folderId || gardenId}`, JSON.stringify(newConfig));
  };

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
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setRenameLoading(false);
    }
  };

  const folders = items.filter((i) => i.type === "folder");
  const files = items.filter((i) => i.type === "file");

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Breadcrumb breadcrumbs={breadcrumbs} gardenSlug={gardenSlug} />
        <div className="flex gap-2 items-center">
          {mounted && (
            <details className="dropdown dropdown-end z-50">
              <summary className="btn btn-ghost btn-sm" title="View Options">
                ⚙️ View
              </summary>
              <ul className="dropdown-content menu bg-base-100 rounded-box z-[100] w-64 p-4 shadow-2xl border border-base-content/10 mt-1 gap-2">
                <li className="menu-title px-0 py-1">Card size</li>
                <li>
                  <input type="range" min="100" max="400" value={viewConfig.cardSize} className="range range-xs" onChange={(e) => updateConfig({ cardSize: Number(e.target.value) })} />
                </li>
                
                <li className="menu-title px-0 py-1 mt-2">Image fit</li>
                <li>
                  <select className="select select-bordered select-sm w-full" value={viewConfig.imageFit} onChange={(e) => updateConfig({ imageFit: e.target.value as any })}>
                    <option value="cover">Cover</option>
                    <option value="contain">Contain</option>
                  </select>
                </li>
                
                <li className="menu-title px-0 py-1 mt-2">Image aspect ratio</li>
                <li>
                  <input type="range" min="0.5" max="3" step="0.1" value={viewConfig.aspectRatio} className="range range-xs" onChange={(e) => updateConfig({ aspectRatio: Number(e.target.value) })} />
                </li>
              </ul>
            </details>
          )}
          {role === "owner" && (
            <Link
              href={`/admin/gardens/${gardenSlug}`}
              className="btn btn-ghost btn-sm"
              title="Garden Settings"
            >
              ⚙ Settings
            </Link>
          )}
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
          <div className="grid gap-4 box" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${viewConfig.cardSize}px, 1fr))` }}>
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="card bg-base-200/50 hover:bg-base-300/60 border border-base-content/5 hover:border-primary/30 group active:scale-95 relative overflow-visible flex flex-col items-center justify-center"
                style={{ aspectRatio: viewConfig.aspectRatio }}
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
                  href={`/my-gardens/${gardenSlug}/${folder.id}`}
                  className="card-body p-0 absolute inset-0 flex flex-col justify-center items-center gap-3 w-full h-full"
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
                viewConfig={viewConfig}
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
