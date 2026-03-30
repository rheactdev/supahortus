"use client";

import React, { useState, useEffect, useCallback } from "react";
import { UppyUploader } from "./UppyUploader";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { Folder, FileIcon, Download, HardDrive } from "@/components/icons/liquid-glass";
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

  const handleDownload = async (key: string) => {
    window.location.href = `/api/s3/download?action=download&key=${encodeURIComponent(key)}`;
  };

  const breadcrumbs = prefix.split("/").filter(Boolean);



  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, dm = 2, sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

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
                <Link
                  href={`/dashboard?prefix=${encodeURIComponent(fGroup)}`}
                  key={fGroup}
                  className="card bg-base-200/50 hover:bg-base-300/60 cursor-pointer border border-base-content/5 hover:border-secondary/30 group active:scale-95"
                >
                  <div className="card-body flex flex-col justify-center items-center gap-3">
                    <div className="p-3 bg-secondary/10 rounded-lg text-secondary group-hover:bg-secondary group-hover:text-secondary-content">
                      <Folder size={32} className="opacity-80" />
                    </div>
                    <span className="font-semibold truncate text-sm" title={folderName}>{folderName}</span>
                  </div>
                </Link>
              );
            })}

            {files.map((file) => {
              const fileName = file.key.split("/").pop() || "";
              const isImage = /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(fileName);

              return (
                <div
                  key={file.key}
                  className="card bg-base-100 hover:bg-base-200 border border-base-content/10 hover:border-primary/30 group overflow-hidden"
                >
                  <div className="card-body p-0 flex flex-col h-full">
                    {/* Visual Preview Area */}
                    <div className="h-32 w-full bg-base-200/30 relative flex items-center justify-center border-input overflow-hidden group-hover:bg-base-200">
                      {isImage ? (
                        <img
                          src={`/api/s3/download?action=download&key=${encodeURIComponent(file.key)}`}
                          alt={fileName}
                          className="w-full h-full object-cover transform opacity-100"
                          loading="lazy"
                        />
                      ) : (
                        <div className="p-3 bg-primary/10 rounded-lg text-primary">
                          <FileIcon size={32} />
                        </div>
                      )}

                      {/* Hover action overlay */}
                      <div className="absolute inset-0 bg-base-300/60 opacity-0 group-hover:opacity-100 flex items-center justify-center backdrop-blur-sm">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDownload(file.key); }}
                          className="p-6 rounded-lg text-primary btn btn-square btn-primary flex items-center justify-center"
                          title="Download"
                        >
                          <Download size={32} />
                        </button>
                      </div>
                    </div>

                    {/* Metadata Area */}
                    <div className="p-4 flex flex-col gap-1 mt-auto">
                      <span className="font-medium truncate text-sm" title={fileName}>{fileName}</span>
                      <span className="text-xs text-base-content/50">{formatSize(file.size)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
