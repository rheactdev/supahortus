"use client";

import React, { useState, useEffect, useRef } from "react";
import Uppy, { Meta, UppyFile } from "@uppy/core";
import { useUppyState } from "@uppy/react";
import AwsS3 from "@uppy/aws-s3";
import ThumbnailGenerator from "@uppy/thumbnail-generator";
import { Upload } from "@/components/icons/liquid-glass";
import { prepareFolderUpload } from "@/lib/actions";
import { QueueUpload } from "./queueupload";

const MULTIPART_THRESHOLD = 50 * 1024 * 1024; // 50 MB

async function readUploadResponse(response: Response, fallback: string) {
  if (response.ok) return response.json();

  const data = await response.json().catch(() => null);
  const message = typeof data?.error === "string" ? data.error : fallback;
  throw new Error(`${message} (HTTP ${response.status})`);
}

function getDirectoryPath(relativePath: unknown) {
  if (typeof relativePath !== "string") return "";
  const separator = relativePath.lastIndexOf("/");
  return separator < 0 ? "" : relativePath.slice(0, separator);
}

export function UppyUploader({ gardenId, parentId, userId, onUploadSuccess }: {
  gardenId: string;
  parentId: string | null;
  userId: string;
  onUploadSuccess: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "preparing" | "uploading">("idle");
  const [error, setError] = useState("");
  const destinations = useRef(new Map<string, string | null>());
  const uploadTokens = useRef(new Map<string, string>());

  function requireUploadToken(fileId: string) {
    const token = uploadTokens.current.get(fileId);
    if (!token) throw new Error("Upload authorization is missing");
    return token;
  }

  function requireDestination(fileId: string) {
    const destination = destinations.current.get(fileId);
    if (destination === undefined) throw new Error("Upload destination is missing");
    return destination;
  }

  const [uppy] = useState(() => new Uppy({
    id: "s3Uploader",
    autoProceed: false,
    onBeforeFileAdded(file, files) {
      const path = file.meta.relativePath;
      // Uppy lowercases paths for its default IDs, but folder paths are case-sensitive.
      const id = typeof path === "string" ? `folder:${path}` : file.id;
      return Object.hasOwn(files, id) ? false : { ...file, id };
    },
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
          parentId: requireDestination(file.id),
          gardenId,
        }),
      });
      const { uploadToken, method, url, headers } = await readUploadResponse(res, "Upload signing failed");
      if (typeof uploadToken !== "string" || !uploadToken) {
        throw new Error("Upload authorization is missing");
      }
      uploadTokens.current.set(file.id, uploadToken);
      return { method, url, headers };
    },

    // --- Multipart upload (files > 50 MB) ---
    async createMultipartUpload(file) {
      const res = await fetch("/api/storage/multipart/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          parentId: requireDestination(file.id),
          gardenId,
        }),
      });
      const data = await readUploadResponse(res, "Multipart initialization failed");
      if (typeof data.uploadToken !== "string" || !data.uploadToken) {
        throw new Error("Upload authorization is missing");
      }
      uploadTokens.current.set(file.id, data.uploadToken);
      return { uploadId: data.uploadId, key: data.key };
    },

    async signPart(file, { uploadId, key, partNumber }) {
      const params = new URLSearchParams({
        uploadId,
        key,
        partNumber: String(partNumber),
        uploadToken: requireUploadToken(file.id),
      });
      const res = await fetch(`/api/storage/multipart/sign-part?${params}`);
      if (!res.ok) throw new Error("Multipart signing failed");
      return await res.json();
    },

    async listParts(file, { uploadId, key }) {
      const params = new URLSearchParams({
        uploadId: uploadId ?? "",
        key,
        uploadToken: requireUploadToken(file.id),
      });
      const res = await fetch(`/api/storage/multipart/list-parts?${params}`);
      if (!res.ok) throw new Error("Could not list uploaded parts");
      return await res.json();
    },

    async completeMultipartUpload(file, { uploadId, key, parts }) {
      const uploadToken = requireUploadToken(file.id);
      const res = await fetch("/api/storage/multipart/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, key, parts, uploadToken }),
      });
      if (!res.ok) throw new Error("Multipart completion failed");
      return {};
    },

    async abortMultipartUpload(file, { uploadId, key }) {
      const uploadToken = uploadTokens.current.get(file.id);
      if (!uploadToken) return;
      await fetch("/api/storage/multipart/abort", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, key, uploadToken }),
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
    const confirmUploads = async (fileIds: string[]) => {
      const confirmations = await Promise.all(fileIds.map(async (id) => {
        const file = uppy.getFile(id);
        if (!file?.progress.uploadComplete || file.error) return false;

        try {
          const response = await fetch("/api/storage/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uploadToken: requireUploadToken(id) }),
          });
          await readUploadResponse(response, "Upload confirmation failed");
          return true;
        } catch (error) {
          if (uppy.getFile(id)) {
            uppy.setFileMeta(id, {
              confirmationError: error instanceof Error ? error.message : "Upload confirmation failed",
            });
          }
          return false;
        } finally {
          uploadTokens.current.delete(id);
        }
      }));

      if (confirmations.some(Boolean)) onUploadSuccess();
    };

    uppy.addPostProcessor(confirmUploads);
    return () => {
      uppy.removePostProcessor(confirmUploads);
    };
  }, [uppy, onUploadSuccess]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setError("");
    try {
      uppy.addFiles(files.map(file => ({
        source: "local",
        name: file.name,
        type: file.type,
        data: file,
        meta: file.webkitRelativePath ? { relativePath: file.webkitRelativePath } : {},
      })));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not add files to the queue");
    } finally {
      e.target.value = "";
    }
  };

  const handleUpload = async () => {
    if (phase !== "idle") return;

    const files = uppy.getFiles().filter(file =>
      !file.progress.uploadComplete && !destinations.current.has(file.id)
    );
    const directoryPaths = [...new Set(files.map(file => getDirectoryPath(file.meta.relativePath)).filter(Boolean))];
    const destination = parentId;
    setError("");

    try {
      let folderIds: Record<string, string> = {};
      if (directoryPaths.length > 0) {
        setPhase("preparing");
        const result = await prepareFolderUpload(gardenId, userId, destination, directoryPaths);
        if (result.created) onUploadSuccess();
        if (result.folderIds === undefined) {
          setError(result.error);
          return;
        }
        folderIds = result.folderIds;
      }

      for (const file of files) {
        const path = getDirectoryPath(file.meta.relativePath);
        destinations.current.set(file.id, path ? folderIds[path] : destination);
      }

      setPhase("uploading");
      await uppy.upload();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setPhase("idle");
    }
  };

  const handleClose = () => {
    if (phase === "preparing") return;
    setIsOpen(false);
    setError("");
    uppy.cancelAll();
    destinations.current.clear();
  };

  return (
    <>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => setIsOpen(true)}
        disabled={phase !== "idle"}
      >
        <Upload size={16} />
        <span className="hidden sm:block">Upload Files</span>
      </button>

      {isOpen && (
        <dialog id="uppy_modal" className="modal modal-open">
          <div className="modal-box flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden">

            <h3 className="flex shrink-0 items-center gap-2 text-lg font-bold">
              <Upload size={24} /> Upload to {parentId ? "Folder" : "Bucket Root"}
            </h3>

            <div className="min-h-0 flex-1 overflow-y-auto py-4 custom-scrollbar">
              <fieldset className="fieldset">
                <legend className="fieldset-legend">Choose files</legend>
                <input type="file" multiple aria-label="Choose files" onChange={handleFileInputChange} disabled={phase !== "idle"} className="file-input w-full hover:border-primary" />
              </fieldset>

              {"webkitdirectory" in HTMLInputElement.prototype && (
                <fieldset className="fieldset">
                  <legend className="fieldset-legend">Choose folder</legend>
                  <input
                    type="file"
                    aria-label="Choose folder"
                    ref={input => { if (input) input.webkitdirectory = true; }}
                    onChange={handleFileInputChange}
                    disabled={phase !== "idle"}
                    className="file-input w-full hover:border-primary"
                  />
                </fieldset>
              )}

              {error && <p className="mt-2 text-sm text-error" role="alert">{error}</p>}

              {fileArray.length > 0 && (
                <fieldset className="fieldset min-w-0">
                  <legend className="fieldset-legend">Queue ({fileArray.length})</legend>
                  <QueueUpload
                    files={fileArray}
                    disableRemoval={phase === "preparing"}
                    onRemove={(id) => {
                      uppy.removeFile(id);
                      destinations.current.delete(id);
                    }}
                  />
                </fieldset>
              )}

            </div>
            <div className="modal-action shrink-0">
              <form method="dialog" className="flex gap-2">
                <button type="button" className="btn btn-ghost" onClick={handleClose} disabled={phase === "preparing"}>Cancel</button>
                <button
                  type="button"
                  onClick={handleUpload}
                  className="btn btn-primary"
                  disabled={phase !== "idle" || fileArray.length === 0 || fileArray.every(f => f.progress.uploadComplete)}
                >
                  {phase === "preparing" ? "Preparing folders…" : phase === "uploading" ? "Uploading…" : "Upload"}
                </button>
              </form>
            </div>
          </div>

          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={handleClose} disabled={phase === "preparing"}>close</button>
          </form>
        </dialog>
      )}
    </>
  );
}
