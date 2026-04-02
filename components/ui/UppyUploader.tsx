"use client";

import React, { useState, useEffect, useRef } from "react";
import Uppy, { Meta, UppyFile } from "@uppy/core";
import { useUppyState } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import ThumbnailGenerator from "@uppy/thumbnail-generator";
import { Upload } from "@/components/icons/liquid-glass";
import { QueueUpload } from "./queueupload";
import { invalidateGardenCache } from "@/lib/actions";

const MULTIPART_THRESHOLD = 50 * 1024 * 1024; // 50 MB

export function UppyUploader({ gardenId, parentId, onUploadSuccess }: { gardenId: string, parentId: string | null, onUploadSuccess: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const parentIdRef = useRef(parentId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemIdMap = useRef(new Map<string, string>());

  useEffect(() => {
    parentIdRef.current = parentId;
  }, [parentId]);

  const [uppy] = useState(() => new Uppy({
    id: "s3Uploader",
    autoProceed: false,
  }).use(AwsS3, {
    shouldUseMultipart: (file) => (file.size ?? 0) > MULTIPART_THRESHOLD,

    // --- Single-part upload (files <= 50 MB) ---
    async getUploadParameters(file) {
      const res = await fetch("/api/storage/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          parentId: parentIdRef.current,
          gardenId,
        }),
      });
      const data = await res.json();
      itemIdMap.current.set(file.id, data.itemId);
      return data;
    },

    // --- Multipart upload (files > 50 MB) ---
    async createMultipartUpload(file) {
      const res = await fetch("/api/storage/multipart/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          parentId: parentIdRef.current,
          gardenId,
        }),
      });
      const data = await res.json();
      itemIdMap.current.set(file.id, data.itemId);
      return { uploadId: data.uploadId, key: data.key };
    },

    async signPart(_file, { uploadId, key, partNumber }) {
      const params = new URLSearchParams({
        uploadId,
        key,
        partNumber: String(partNumber),
      });
      const res = await fetch(`/api/storage/multipart/sign-part?${params}`);
      return await res.json();
    },

    async listParts(_file, { uploadId, key }) {
      const params = new URLSearchParams({ uploadId: uploadId ?? "", key });
      const res = await fetch(`/api/storage/multipart/list-parts?${params}`);
      return await res.json();
    },

    async completeMultipartUpload(_file, { uploadId, key, parts }) {
      await fetch("/api/storage/multipart/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, key, parts }),
      });
      return {};
    },

    async abortMultipartUpload(_file, { uploadId, key }) {
      await fetch("/api/storage/multipart/abort", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, key }),
      });
    },
  }).use(ThumbnailGenerator, {
    thumbnailWidth: 200,
    thumbnailHeight: 200,
    waitForThumbnailsBeforeUpload: false,
  }));

  // Bind to Uppy's headless state
  const uppyFiles = useUppyState(uppy, (state) => state.files);
  const fileArray: UppyFile<Meta, Record<string, never>>[] = Object.values(uppyFiles);

  useEffect(() => {
    const handleComplete = async (result: { successful?: { id: string }[] }) => {
      if (result.successful && result.successful.length > 0) {
        // Confirm all successful uploads (sets status from 'pending' to 'ready')
        await Promise.all(
          result.successful.map(async (file: { id: string }) => {
            const itemId = itemIdMap.current.get(file.id);
            if (itemId) {
              await fetch("/api/storage/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itemId }),
              });
              itemIdMap.current.delete(file.id);
            }
          })
        );
        await invalidateGardenCache(gardenId);
        onUploadSuccess();
      }
    };
    uppy.on("complete", handleComplete);

    return () => {
      uppy.off("complete", handleComplete);
    };
  }, [uppy, onUploadSuccess, gardenId]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      try {
        uppy.addFile({ source: "local", name: file.name, type: file.type, data: file });
      } catch { /* ignore dupes */ }
    });
    e.target.value = "";
  };

  const handleClose = () => {
    setIsOpen(false);
    uppy.cancelAll();
  };

  return (
    <>
      <button
        className="btn btn-primary"
        onClick={() => setIsOpen(true)}
      >
        <Upload size={18} />
        <span className="hidden sm:block">Upload Files</span>
      </button>

      {isOpen && (
        <dialog id="uppy_modal" className="modal modal-open">
          <div className="modal-box w-full max-w-6xl h-[90vh]">

            <h3 className="font-bold text-lg flex items-center gap-2">
              <Upload size={24} /> Upload to {parentId ? "Folder" : "Bucket Root"}
            </h3>

            <div className="py-4">
              <fieldset className="fieldset">
                <legend className="fieldset-legend">Pick a file</legend>
                <input type="file" multiple onChange={handleFileInputChange} ref={fileInputRef} className="file-input w-full hover:border-primary" />
              </fieldset>

              {fileArray.length > 0 && (
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Queue ({fileArray.length})</legend>
                  <QueueUpload files={fileArray} onRemove={(id) => uppy.removeFile(id)} />
                </fieldset>
              )}

            </div>
            <div className="modal-action absolute bottom-5 right-5">
              <form method="dialog" className="flex gap-2">
                <button className="btn btn-ghost" onClick={handleClose}>Cancel</button>
                <button
                  onClick={() => uppy.upload()}
                  className="btn btn-primary"
                  disabled={fileArray.length === 0 || fileArray.every(f => f.progress.uploadComplete)}
                >
                  {fileArray.some(f => Number(f.progress.bytesUploaded) > 0 && !f.progress.uploadComplete)
                    ? <span className="loading loading-ring loading-sm"></span>
                    : "Upload"}
                </button>
              </form>
            </div>
          </div>

          <form method="dialog" className="modal-backdrop" onClick={handleClose}>
            <button>close</button>
          </form>
        </dialog>
      )}
    </>
  );
}
