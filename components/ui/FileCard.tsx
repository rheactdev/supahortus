import React, { useState, memo } from "react";
import Image from "next/image";
import {
  FileIcon,
  Download,
  Trash,
  Share,
  MenuDots,
  DocumentIcon,
  Checkmark,
} from "@/components/icons/liquid-glass";
import { deleteItem, renameItem, createShareLink } from "@/lib/actions";
import type { Item } from "@/lib/data";
import { Dropdown, DropdownTrigger, DropdownContent } from "./DropdownMenu";
import { ImageIcon } from "../icons/ImageIcon";
import {
  IconStyle,
  EXTENSION_ICONS,
  LIQUID_GLASS_COLOR,
  ExtensionIconProps,
} from "../icons/constants";
import { PdfThumbnail } from "./PdfThumbnail";

interface FileCardProps {
  item: Item;
  thumbnailUrl?: string;
  gardenId: string;
  userId: string;
  folderId: string | null;
  canUpload: boolean;
  canDelete: boolean;
  allowShareLinks?: boolean;
  isSelected?: boolean;
  selectionEnabled?: boolean;
  onToggleSelection?: (itemId: string) => void;
  onPreview?: (item: Item) => void;
  onRefresh: () => void;
  viewConfig: {
    cardSize: number;
    imageFit: "cover" | "contain";
    aspectRatio: number;
  };
}

export interface ExtensionIcon {
  [ext: string]: {
    style: IconStyle;
    icon: string;
  };
}

export const FileCard = memo(function FileCard({
  item,
  thumbnailUrl,
  gardenId,
  userId,
  canUpload,
  canDelete,
  allowShareLinks = true,
  isSelected = false,
  selectionEnabled = false,
  onToggleSelection,
  onPreview,
  onRefresh,
  viewConfig,
}: FileCardProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState(item.name);
  const [renameLoading, setRenameLoading] = useState(false);
  const ext = item.name.split(".").pop()?.toLowerCase() || "";
  const IMAGE_EXTENSIONS = new Set([
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "avif",
    "afdesign",
    "afphoto",
    "afpub",
    "af",
    "psd",
  ]);

  const isImage =
    item.mime_type?.startsWith("image/") || IMAGE_EXTENSIONS.has(ext);
  const isPdf = item.mime_type === "application/pdf" || ext === "pdf";

  // Easily add more extension -> icon mappings here
  // const EXTENSION_ICONS: Record<string, string> = {
  //   zip: "/icons/lg-color/icons8-archive-folder.svg",
  //   psd: "/icons/lg-color/icons8-adobe-photoshop.svg",
  //   rpy: "/icons/lg-color/icons8-python.svg",
  //   py: "/icons/lg-color/icons8-python.svg"
  // };

  let curIcon: ExtensionIconProps = EXTENSION_ICONS[ext];
  if (!EXTENSION_ICONS[ext] && isImage) {
    curIcon = {
      style: LIQUID_GLASS_COLOR,
      icon: "icons8-full-image",
    };
  }
  // if (EXTENSION_ICONS[ext]) {
  //   curIcon = <ImageIcon size={18} style={LIQUID_GLASS_COLOR} icon="icons8-full-image" />;
  // } else if (isImage) {
  //   curIcon = <Image src="/icons/lg-color/icons8-full-image.svg" width={18} height={18} alt="photo icon" />;
  // }

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

  const handleRegenerateThumbnail = async () => {
    try {
      setToast(true);
      await fetch("/api/storage/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          forceThumbnail: true,
        }),
      });
      setTimeout(() => setToast(false), 3000);
    } catch (err) {
      console.error("Failed to regenerate thumbnail", err);
    }
    setDropdownOpen(false);
  };

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      !selectionEnabled ||
      (!event.metaKey && !event.ctrlKey) ||
      !onToggleSelection
    ) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;

    event.preventDefault();
    onToggleSelection(item.id);
  };

  const handlePreviewClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (
      selectionEnabled &&
      (event.metaKey || event.ctrlKey) &&
      onToggleSelection
    ) {
      onToggleSelection(item.id);
      return;
    }
    onPreview?.(item);
  };

  return (
    <>
      <div
        className={`card bg-base-100 hover:bg-base-200 border group overflow-hidden relative h-full select-none ${
          isSelected
            ? "border-primary ring-2 ring-primary/35"
            : "border-base-content/10 hover:border-primary/30"
        }`}
        aria-selected={isSelected}
        onClick={handleCardClick}
      >
        {isSelected && (
          <span className="absolute top-10 left-2 z-10 size-6 rounded-full bg-primary text-primary-content flex items-center justify-center shadow-sm">
            <Checkmark size={14} />
          </span>
        )}
        <div className="card-body p-0 flex flex-col h-full relative gap-0">
          {/* Metadata Top Bar */}
          <div className="p-2 pl-3 flex items-center gap-2 bg-base-200/50 border-b border-base-content/5 group-hover:bg-base-300/50 transition-colors">
            <div className="text-secondary shrink-0 flex items-center justify-center">
              {curIcon ? (
                <ImageIcon
                  size={18}
                  style={curIcon.style}
                  icon={curIcon.icon}
                />
              ) : (
                <FileIcon size={18} />
              )}
            </div>

            <span
              className="font-medium truncate text-sm flex-1"
              title={item.name}
            >
              {item.name}
            </span>

            {/* 3 dot menu overlay */}
            <div
              className={`shrink-0 transition-opacity ${dropdownOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            >
              <Dropdown
                className="dropdown-end"
                open={dropdownOpen}
                onOpenChange={setDropdownOpen}
              >
                <DropdownTrigger className="btn-xs btn-ghost btn-square shadow-none">
                  <MenuDots size={16} />
                </DropdownTrigger>
                <DropdownContent className="w-48 z-[20]">
                  {allowShareLinks && (
                    <li>
                      <button onClick={handleShare}>
                        <Share size={16} className="text-info" /> Share Link
                      </button>
                    </li>
                  )}
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
                      <Download size={16} className="text-secondary" /> Download
                    </button>
                  </li>
                  {isImage && canUpload && (
                    <li>
                      <button
                        onClick={handleRegenerateThumbnail}
                        className="text-primary font-medium"
                      >
                        <ImageIcon
                          size={16}
                          style="lg-color"
                          icon="icons8-restart"
                        />
                        Regenerate Thumb
                      </button>
                    </li>
                  )}
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
                </DropdownContent>
              </Dropdown>
            </div>
          </div>

          {/* Visual Preview Area */}
          <button
            type="button"
            className="w-full bg-base-200/20 relative flex items-center justify-center flex-1 overflow-hidden cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            style={{ aspectRatio: viewConfig.aspectRatio }}
            onClick={handlePreviewClick}
            aria-label={`Preview ${item.name}`}
          >
            {isPdf ? (
              <PdfThumbnail
                itemId={item.id}
                name={item.name}
                fit={viewConfig.imageFit}
              />
            ) : isImage && thumbnailUrl ? (
              <Image
                src={thumbnailUrl}
                alt={item.name}
                fill
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 15vw"
                className={`${viewConfig.imageFit === "contain" ? "object-contain" : "object-cover"} transform opacity-100 hover:scale-105 transition-transform`}
              />
            ) : (
              <div className="p-3 bg-primary/10 rounded-lg text-primary">
                {curIcon ? (
                  <ImageIcon
                    size={32}
                    style={curIcon.style}
                    icon={curIcon.icon}
                  />
                ) : (
                  <FileIcon size={32} />
                )}
                {/* <FileIcon
                  size={32}
                  className="group-hover:opacity-50 transition-opacity"
                /> */}
              </div>
            )}
          </button>
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
