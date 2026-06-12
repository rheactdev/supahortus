"use client";

import React, {
  useState,
  useCallback,
  useTransition,
  useEffect,
  useMemo,
} from "react";
import { UppyUploader } from "./UppyUploader";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { Dropdown, DropdownTrigger, DropdownContent } from "./DropdownMenu";
import {
  Folder,
  MenuDots,
  DocumentIcon,
  Trash,
  Close,
} from "@/components/icons/liquid-glass";
import { FileCard } from "./FileCard";
import Link from "next/link";
import { Breadcrumb } from "./breadcrumb";
import { useRouter } from "next/navigation";
import { deleteFiles, moveFiles, renameItem } from "@/lib/actions";
import type {
  Item,
  BreadcrumbItem,
  MoveTreeGarden,
} from "@/lib/data";
import Image from "next/image";
import { MoveFilesDialog } from "./MoveFilesDialog";
import { FilePreviewModal } from "./FilePreviewModal";

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
  basePath?: string;
  allowShareLinks?: boolean;
  moveTree?: MoveTreeGarden[];
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
  basePath = `/my-gardens/${gardenSlug}`,
  allowShareLinks = true,
  moveTree = [],
}: DriveExplorerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [toast, setToast] = useState("");
  const [renameModal, setRenameModal] = useState<Item | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<Item | null>(null);

  const [viewConfig, setViewConfig] = useState<{
    cardSize: number;
    imageFit: "cover" | "contain";
    aspectRatio: number;
    sortBy: "name" | "date";
    sortDir: "asc" | "desc";
  }>({
    cardSize: 200,
    imageFit: "contain",
    aspectRatio: 1,
    sortBy: "name",
    sortDir: "asc",
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const key = `view-config-${folderId || gardenId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setViewConfig(JSON.parse(saved));
      } catch {}
    }
  }, [folderId, gardenId]);

  useEffect(() => {
    setSelectedIds((current) => {
      const visibleIds = new Set(
        items.filter((item) => item.type === "file").map((item) => item.id),
      );
      return new Set([...current].filter((id) => visibleIds.has(id)));
    });
  }, [items]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !previewFile) {
        setSelectedIds(new Set());
        setShowMoveDialog(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewFile]);

  const updateConfig = (updates: Partial<typeof viewConfig>) => {
    const newConfig = { ...viewConfig, ...updates };
    setViewConfig(newConfig);
    localStorage.setItem(
      `view-config-${folderId || gardenId}`,
      JSON.stringify(newConfig),
    );
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
      await renameItem(renameModal.id, renameName.trim(), gardenId, userId);
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

  const toggleFileSelection = useCallback((itemId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }, []);

  const handleDeleteSelected = async () => {
    if (
      selectedIds.size === 0 ||
      !window.confirm(
        `Delete ${selectedIds.size} selected file${
          selectedIds.size === 1 ? "" : "s"
        }?`,
      )
    ) {
      return;
    }

    setBulkActionLoading(true);
    try {
      await deleteFiles([...selectedIds], gardenId, userId);
      setSelectedIds(new Set());
      showToast("Files queued for deletion");
      refreshData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete files");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleMoveSelected = async (destination: {
    gardenId: string;
    parentId: string | null;
  }) => {
    setBulkActionLoading(true);
    try {
      await moveFiles(
        [...selectedIds],
        gardenId,
        destination.gardenId,
        destination.parentId,
        userId,
      );
      setShowMoveDialog(false);
      setSelectedIds(new Set());
      showToast("Files queued to move");
      refreshData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to move files");
    } finally {
      setBulkActionLoading(false);
    }
  };

  const folders = items.filter((i) => i.type === "folder");
  const files = items.filter((i) => i.type === "file");

  const sortedFolders = useMemo(() => {
    return [...folders].sort((a, b) => {
      if (viewConfig.sortBy === "name") {
        return viewConfig.sortDir === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      } else {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return viewConfig.sortDir === "asc" ? timeA - timeB : timeB - timeA;
      }
    });
  }, [folders, viewConfig.sortBy, viewConfig.sortDir]);

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      if (viewConfig.sortBy === "name") {
        return viewConfig.sortDir === "asc"
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      } else {
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        return viewConfig.sortDir === "asc" ? timeA - timeB : timeB - timeA;
      }
    });
  }, [files, viewConfig.sortBy, viewConfig.sortDir]);

  return (
    <div className="flex-1 flex flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Breadcrumb breadcrumbs={breadcrumbs} basePath={basePath} />
        <div className="flex gap-2 items-center flex-wrap">
          {mounted && (
            <>
              <Dropdown className="dropdown-end z-50">
                <DropdownTrigger
                  className="btn-ghost btn-sm"
                  title="Sort Options"
                >
                  {viewConfig.sortBy === "name" ? "Name" : "Date added"}{" "}
                  {viewConfig.sortDir === "asc" ? (
                    <Image
                      src={"/icons/icons8-arrow-up.svg"}
                      width={14}
                      height={14}
                      alt="arrow up"
                    />
                  ) : (
                    <Image
                      src="/icons/icons8-arrow-down.svg"
                      width={14}
                      height={14}
                      alt="arrow down"
                    />
                  )}
                </DropdownTrigger>
                <DropdownContent className="w-56 z-[100]">
                  <li className="menu-title px-2 py-1">Sort by</li>
                  <li>
                    <button
                      className={viewConfig.sortBy === "name" ? "active" : ""}
                      onClick={(e) => {
                        e.preventDefault();
                        updateConfig({ sortBy: "name" });
                      }}
                    >
                      Name
                    </button>
                  </li>
                  <li>
                    <button
                      className={viewConfig.sortBy === "date" ? "active" : ""}
                      onClick={(e) => {
                        e.preventDefault();
                        updateConfig({ sortBy: "date" });
                      }}
                    >
                      Date added
                    </button>
                  </li>

                  <li className="menu-title px-2 py-1 mt-2">Sort direction</li>
                  <li>
                    <button
                      className={viewConfig.sortDir === "asc" ? "active" : ""}
                      onClick={(e) => {
                        e.preventDefault();
                        updateConfig({ sortDir: "asc" });
                      }}
                    >
                      {viewConfig.sortBy === "name" ? "A to Z" : "Old to new"}
                    </button>
                  </li>
                  <li>
                    <button
                      className={viewConfig.sortDir === "desc" ? "active" : ""}
                      onClick={(e) => {
                        e.preventDefault();
                        updateConfig({ sortDir: "desc" });
                      }}
                    >
                      {viewConfig.sortBy === "name" ? "Z to A" : "New to old"}
                    </button>
                  </li>
                </DropdownContent>
              </Dropdown>

              <Dropdown className="dropdown-end z-50">
                <DropdownTrigger
                  className="btn-soft btn-sm"
                  title="View Options"
                >
                  <Image
                    src="/icons/icons8-eye.svg"
                    width={16}
                    height={16}
                    alt=""
                  />
                  View
                </DropdownTrigger>
                <DropdownContent className="w-64 z-[100] gap-2 p-4">
                  <li className="menu-title px-0 py-1">Card size</li>
                  <li>
                    <input
                      type="range"
                      min="100"
                      max="400"
                      value={viewConfig.cardSize}
                      className="range range-xs"
                      onChange={(e) =>
                        updateConfig({ cardSize: Number(e.target.value) })
                      }
                    />
                  </li>

                  <li className="menu-title px-0 py-1 mt-2">Image fit</li>
                  <li>
                    <select
                      className="select select-bordered select-sm w-full"
                      value={viewConfig.imageFit}
                      onChange={(e) =>
                        updateConfig({
                          imageFit: e.target.value as "cover" | "contain",
                        })
                      }
                    >
                      <option value="cover">Cover</option>
                      <option value="contain">Contain</option>
                    </select>
                  </li>

                  <li className="menu-title px-0 py-1 mt-2">
                    Image aspect ratio
                  </li>
                  <li>
                    <input
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.1"
                      value={viewConfig.aspectRatio}
                      className="range range-xs"
                      onChange={(e) =>
                        updateConfig({ aspectRatio: Number(e.target.value) })
                      }
                    />
                  </li>
                </DropdownContent>
              </Dropdown>
            </>
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

      {selectedIds.size > 0 && (
        <div className="sticky top-3 z-30 flex flex-wrap items-center justify-between gap-3 border-y border-primary/20 bg-base-200/95 px-3 py-2 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="badge badge-primary">
              {selectedIds.size}
            </span>
            <span className="text-sm font-medium truncate">
              file{selectedIds.size === 1 ? "" : "s"} selected
            </span>
          </div>
          <div className="flex items-center gap-1">
            {canDelete && moveTree.some((garden) => garden.can_upload) && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowMoveDialog(true)}
                disabled={bulkActionLoading}
              >
                <Folder size={16} />
                Move
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="btn btn-ghost btn-sm text-error"
                onClick={handleDeleteSelected}
                disabled={bulkActionLoading}
              >
                <Trash size={16} />
                Delete
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-square"
              onClick={() => setSelectedIds(new Set())}
              title="Clear selection"
            >
              <Close size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden min-h-[50vh] flex flex-col">
        {isPending ? (
          <div className="w-full h-100 flex justify-center items-center">
            <div className="loading loading-ring loading-lg h-48 w-48" />
          </div>
        ) : sortedFolders.length === 0 && sortedFiles.length === 0 ? (
          <div className="flex flex-col flex-1 justify-center items-center text-base-content/40 gap-4 min-h-[400px]">
            <Folder size={64} className="opacity-20" />
            <p className="font-semibold text-lg">No files or folders here</p>
            <p className="text-sm">
              {canUpload
                ? "Upload something to get started"
                : "Nothing has been added yet"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8 w-full">
            {sortedFolders.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-base-content/60 px-1">
                  Folders
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 box">
                  {sortedFolders.map((folder) => (
                    <div
                      key={folder.id}
                      className="card bg-base-200/50 hover:bg-base-300/60 border border-base-content/5 hover:border-primary/30 group active:scale-95 relative overflow-visible"
                    >
                      {canUpload && (
                        <div className="absolute top-1/2 -translate-y-1/2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Dropdown className="dropdown-end">
                            <DropdownTrigger className="btn-sm btn-ghost btn-square shadow-none">
                              <MenuDots size={18} />
                            </DropdownTrigger>
                            <DropdownContent className="w-48 z-[20]">
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
                            </DropdownContent>
                          </Dropdown>
                        </div>
                      )}

                      <Link
                        href={`${basePath}/${folder.id}`}
                        className="card-body p-4 flex flex-row items-center gap-3 w-full"
                      >
                        <Folder
                          size={20}
                          className="opacity-80 text-secondary"
                        />
                        <span
                          className="font-medium truncate text-sm flex-1 pr-8"
                          title={folder.name}
                        >
                          {folder.name}
                        </span>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sortedFiles.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-base-content/60 px-1">
                  Files
                </h3>
                <div
                  className="grid gap-4 box"
                  style={{
                    gridTemplateColumns: `repeat(auto-fill, minmax(${viewConfig.cardSize}px, 1fr))`,
                  }}
                >
                  {sortedFiles.map((file) => (
                    <FileCard
                      key={file.id}
                      item={file}
                      thumbnailUrl={thumbnailUrls[file.id]}
                      gardenId={gardenId}
                      userId={userId}
                      folderId={folderId}
                      canUpload={canUpload}
                      canDelete={canDelete}
                      allowShareLinks={allowShareLinks}
                      isSelected={selectedIds.has(file.id)}
                      selectionEnabled={canDelete}
                      onToggleSelection={toggleFileSelection}
                      onPreview={setPreviewFile}
                      onRefresh={refreshData}
                      viewConfig={viewConfig}
                    />
                  ))}
                </div>
              </div>
            )}
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

      {showMoveDialog && (
        <MoveFilesDialog
          gardens={moveTree}
          selectedCount={selectedIds.size}
          currentGardenId={gardenId}
          currentFolderId={folderId}
          loading={bulkActionLoading}
          onClose={() => setShowMoveDialog(false)}
          onMove={handleMoveSelected}
        />
      )}

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          files={sortedFiles}
          onClose={() => setPreviewFile(null)}
          onNavigate={setPreviewFile}
        />
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
