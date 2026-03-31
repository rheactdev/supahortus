import React, { useState } from "react";
import { FileIcon, Download, Trash, Share, MenuDots } from "@/components/icons/liquid-glass";

type S3File = {
  key: string;
  size: number;
  lastModified: string;
};

interface FileCardProps {
  file: S3File;
  prefix: string;
  onRefresh: () => void;
}

export function FileCard({ file, onRefresh }: FileCardProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [toast, setToast] = useState(false);

  const fileName = file.key.split("/").pop() || "";
  const isImage = /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(fileName);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, dm = 2, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleDownload = () => {
    window.location.href = `/api/s3/download?action=download&download=true&key=${encodeURIComponent(file.key)}`;
    setDropdownOpen(false);
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${fileName}?`)) {
      try {
        await fetch(`/api/s3/delete?key=${encodeURIComponent(file.key)}`, { method: "DELETE" });
        onRefresh();
      } catch (err) {
        console.error("Failed to delete", err);
      }
    }
    setDropdownOpen(false);
  };

  const handleShare = async () => {
    try {
      const res = await fetch(`/api/s3/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: file.key })
      });
      const data = await res.json();
      if (data.url) {
        await navigator.clipboard.writeText(data.url);
        setToast(true);
        setTimeout(() => setToast(false), 3000);
      } else {
        console.error(data.error);
      }
    } catch (err) {
      console.error("Failed to share", err);
    }
    setDropdownOpen(false);
  };

  return (
    <>
      <div className="card bg-base-100 hover:bg-base-200 border border-base-content/10 hover:border-primary/30 group overflow-visible relative h-full">
        <div className="card-body p-0 flex flex-col h-full rounded-[inherit] relative">

          {/* 3 dot menu overlay */}
          <div className={`absolute top-2 right-2 z-10 transition-opacity ${dropdownOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <details className="dropdown dropdown-end" open={dropdownOpen} onToggle={(e) => setDropdownOpen((e.target as HTMLDetailsElement).open)}>
              <summary className="btn btn-sm btn-square btn-soft shadow-sm">
                <MenuDots size={18} />
              </summary>
              <ul className="dropdown-content menu bg-base-100 rounded-box z-[20] w-48 p-2 shadow-2xl border border-base-content/10 mt-1">
                <li><button onClick={handleShare}><Share size={16} className="text-info" /> Share Link</button></li>
                <li><button onClick={handleDownload}><Download size={16} className="text-secondary" /> Download</button></li>
                <div className="divider my-0"></div>
                <li><button onClick={handleDelete} className="text-error hover:bg-error/10 hover:text-error"><Trash size={16} /> Delete</button></li>
              </ul>
            </details>
          </div>

          {/* Visual Preview Area */}
          <div className="h-32 w-full bg-base-200/30 relative flex items-center justify-center border-b border-base-content/5 overflow-hidden group-hover:bg-base-200 rounded-t-[inherit]">
            {isImage ? (
              <img
                src={`/api/s3/download?action=download&key=${encodeURIComponent(file.key)}`}
                alt={fileName}
                className="w-full h-full object-cover transform opacity-100 hover:scale-105 transition-transform"
                loading="lazy"
              />
            ) : (
              <div className="p-3 bg-primary/10 rounded-lg text-primary">
                <FileIcon size={32} className="group-hover:opacity-50 transition-opacity" />
              </div>
            )}
          </div>

          {/* Metadata Area */}
          <div className="p-4 flex flex-col gap-1 mt-auto group-hover:opacity-50 transition-opacity">
            <span className="font-medium truncate text-sm" title={fileName}>{fileName}</span>
            <span className="text-xs text-base-content/50">{formatSize(file.size)}</span>
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
    </>
  );
}
