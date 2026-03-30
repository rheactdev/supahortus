"use client";

import React, { useState, useEffect, useRef } from "react";
import Uppy, { Meta, UppyFile } from "@uppy/core";
import { useUppyState } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import ThumbnailGenerator from "@uppy/thumbnail-generator";
import { Upload, Trash, Checkmark, FileIcon, Add, Video, Music, PdfIcon, DocumentIcon } from "@/components/icons/liquid-glass";
import { QueueUpload } from "./queueupload";

const getFileIcon = (type: string, size = 64) => {
  if (type.startsWith('video/')) return <Video size={size} />;
  if (type.startsWith('audio/')) return <Music size={size} />;
  if (type.includes('pdf')) return <PdfIcon size={size} />;
  if (type.includes('document') || type.includes('text/')) return <DocumentIcon size={size} />;
  return <FileIcon size={size} />;
};

export function UppyUploader({ prefix, onUploadSuccess }: { prefix: string, onUploadSuccess: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const prefixRef = useRef(prefix);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    prefixRef.current = prefix;
  }, [prefix]);

  const [uppy] = useState(() => new Uppy({
    id: "s3Uploader",
    autoProceed: false,
  }).use(AwsS3, {
    shouldUseMultipart: false,
    getUploadParameters(file) {
      return fetch("/api/s3/presign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          prefix: prefixRef.current,
        }),
      }).then((response) => response.json());
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
    const handleComplete = (result: any) => {
      if (result.successful.length > 0) {
        onUploadSuccess();
      }
    };
    uppy.on("complete", handleComplete);

    return () => {
      uppy.off("complete", handleComplete);
    };
  }, [uppy, onUploadSuccess]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      try {
        uppy.addFile({ source: "local", name: file.name, type: file.type, data: file });
      } catch (err) { /* ignore dupes */ }
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
              <Upload size={24} /> Upload to {prefix || "Bucket Root"}
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
