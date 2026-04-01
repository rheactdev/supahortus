"use client";

import React, { useState, useRef, useEffect } from "react";
import { Add, Close } from "@/components/icons/liquid-glass";
import { CloseButton } from "./closebutton";
import { DaisyUIForm } from "./form";

interface CreateFolderDialogProps {
  parentId: string | null;
  onSuccess: () => void;
}

export function CreateFolderDialog({ parentId, onSuccess }: CreateFolderDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setFolderName("");
      setError("");
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = folderName.trim();

    if (!cleanName) {
      setError("Folder name cannot be empty");
      return;
    }
    if (cleanName.includes("/")) {
      setError("Folder name cannot contain slashes");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/s3/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, parentId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create folder");
      }

      setIsOpen(false);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="btn btn-soft"
      >
        <Add size={18} />
        <span className="hidden sm:block">New Folder</span>
      </button>

      {isOpen && (
        <dialog className="modal modal-open bg-black/40 backdrop-blur-sm" open>
          <div className="modal-box">
            <form onSubmit={handleSubmit}>

              <h3 className="font-bold text-lg flex items-center gap-2">
                <Add className="text-secondary" />
                Create New Folder
              </h3>

              <DaisyUIForm
                label="Folder Name"
                descriptionText="You can edit folder name later on from settings"
                placeholder="e.g. Invoices"
                value={folderName}
                onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setFolderName(e.target.value)}
                error={error}
              />

              <div className="modal-action mt-6">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setIsOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-secondary min-w-[100px]"
                  disabled={isSubmitting || !folderName.trim()}
                >
                  {isSubmitting ? <span className="loading loading-ring loading-sm"></span> : "Create"}
                </button>
              </div>
            </form>
          </div>
          <div className="modal-backdrop" onClick={() => !isSubmitting && setIsOpen(false)}>
            <button className="cursor-default">close</button>
          </div>
        </dialog>
      )}
    </>
  );
}
