import React, { useState, memo } from "react";
import {
  FileIcon,
  Download,
  Trash,
  Share,
  MenuDots,
  DocumentIcon,
} from "@/components/icons/liquid-glass";
import { deleteItem, renameItem, createShareLink } from "@/lib/actions";
import type { Item } from "@/lib/data";

interface FileCardProps {
  item: Item;
  thumbnailUrl?: string;
  gardenId: string;
  userId: string;
  folderId: string | null;
  canUpload: boolean;
  canDelete: boolean;
  onRefresh: () => void;
}

export const FileCard = memo(function FileCard({
  item,
  thumbnailUrl,
  gardenId,
  userId,
  canUpload,
  canDelete,
  onRefresh,
}: FileCardProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(item.name);
  const [renameLoading, setRenameLoading] = useState(false);

  const isImage = /\.(jpg|jpeg|png|gif|webp|svg|avif|psd|afdesign|afphoto|afpub|af)$/i.test(item.name);

  const handleDownload = () => {
    window.location.href = `/api/storage/download?action=download&download=true&id=${encodeURIComponent(item.id)}`;
    setDropdownOpen(false);
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${item.name}?`)) {
      try {
        await deleteItem(item.id, gardenId, userId);
        onRefresh();
      } catch (err) {
        console.error("Failed to delete", err);
      }
    }
    setDropdownOpen(false);
  };

  const handleShare = async () => {
    try {
      const url = await createShareLink(item.id, gardenId, userId);
      await navigator.clipboard.writeText(url);
      setToast(true);
      setTimeout(() => setToast(false), 3000);
    } catch (err) {
      console.error("Failed to share", err);
    }
    setDropdownOpen(false);
  };

  const handleRename = async () => {
    if (!renameName.trim() || renameName.trim() === item.name) return;
    setRenameLoading(true);
    try {
      await renameItem(item.id, renameName.trim(), gardenId, userId);
      setRenameOpen(false);
      onRefresh();
    } catch (err) {
      console.error("Failed to rename", err);
    } finally {
      setRenameLoading(false);
    }
  };

  return (
    <>
      <div className="card bg-base-100 hover:bg-base-200 border border-base-content/10 hover:border-primary/30 group overflow-visible relative h-full">
        <div className="card-body p-0 flex flex-col h-full rounded-[inherit] relative">
          {/* 3 dot menu overlay */}
          <div
            className={`absolute top-2 right-2 z-10 transition-opacity ${dropdownOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          >
            <details
              className="dropdown dropdown-end"
              open={dropdownOpen}
              onToggle={(e) =>
                setDropdownOpen(
                  (e.target as HTMLDetailsElement).open
                )
              }
            >
              <summary className="btn btn-sm btn-square btn-soft shadow-sm">
                <MenuDots size={18} />
              </summary>
              <ul className="dropdown-content menu bg-base-100 rounded-box z-[20] w-48 p-2 shadow-2xl border border-base-content/10 mt-1">
                <li>
                  <button onClick={handleShare}>
                    <Share size={16} className="text-info" /> Share Link
                  </button>
                </li>
                {canUpload && (
                  <li>
                    <button
                      onClick={() => {
                        setRenameOpen(true);
                        setRenameName(item.name);
                        setDropdownOpen(false);
                      }}
                    >
                      <DocumentIcon size={16} className="text-warning" />{" "}
                      Rename
                    </button>
                  </li>
                )}
                <li>
                  <button onClick={handleDownload}>
                    <Download size={16} className="text-secondary" />{" "}
                    Download
                  </button>
                </li>
                {canDelete && (
                  <>
                    <div className="divider my-0" />
                    <li>
                      <button
                        onClick={handleDelete}
                        className="text-error hover:bg-error/10 hover:text-error"
                      >
                        <Trash size={16} /> Delete
                      </button>
                    </li>
                  </>
                )}
              </ul>
            </details>
          </div>

          {/* Visual Preview Area */}
          <div className="h-32 w-full bg-base-200/30 relative flex items-center justify-center border-b border-base-content/5 overflow-hidden group-hover:bg-base-200 rounded-t-[inherit]">
            {isImage && thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={item.name}
                className="w-full h-full object-cover transform opacity-100 hover:scale-105 transition-transform"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="p-3 bg-primary/10 rounded-lg text-primary">
                <FileIcon
                  size={32}
                  className="group-hover:opacity-50 transition-opacity"
                />
              </div>
            )}
          </div>

          {/* Metadata Area */}
          <div className="p-4 flex flex-col gap-1 mt-auto group-hover:opacity-50 transition-opacity">
            <span className="font-medium truncate text-sm" title={item.name}>
              {item.name}
            </span>
          </div>
        </div>
      </div>

      {toast && (
        <div className="toast toast-end z-50">
          <div className="alert alert-success shadow-lg text-success-content font-medium text-sm">
            <span>Link Copied to Clipboard!</span>
          </div>
        </div>
      )}

      {renameOpen && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-xl mb-4">Rename File</h3>
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
                onClick={() => setRenameOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleRename}
                disabled={
                  !renameName.trim() ||
                  renameName.trim() === item.name ||
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
            <button onClick={() => setRenameOpen(false)}>close</button>
          </form>
        </dialog>
      )}
    </>
  );
});
