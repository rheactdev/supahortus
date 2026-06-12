"use client";

import dynamic from "next/dynamic";
import type { Item } from "@/lib/data";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const ImagePreview = dynamic(
  () =>
    import("./previews/ImagePreview").then((module) => module.ImagePreview),
  { loading: () => <PreviewSpinner /> },
);
const VideoPreview = dynamic(
  () =>
    import("./previews/VideoPreview").then((module) => module.VideoPreview),
  { loading: () => <PreviewSpinner /> },
);
const AudioPreview = dynamic(
  () =>
    import("./previews/AudioPreview").then((module) => module.AudioPreview),
  { loading: () => <PreviewSpinner /> },
);
const PdfPreview = dynamic(
  () => import("./previews/PdfPreview").then((module) => module.PdfPreview),
  { loading: () => <PreviewSpinner />, ssr: false },
);
const CodePreview = dynamic(
  () => import("./previews/CodePreview").then((module) => module.CodePreview),
  { loading: () => <PreviewSpinner /> },
);

const OFFICE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx"]);

const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "svg",
  "avif",
  "bmp",
  "ico",
  "tiff",
  "tif",
]);
const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "mov",
  "avi",
  "mkv",
  "m4v",
  "ogv",
]);
const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "ogg",
  "flac",
  "aac",
  "m4a",
  "wma",
  "opus",
]);
const CODE_EXTENSIONS = new Set([
  "txt",
  "md",
  "mdx",
  "py",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "css",
  "scss",
  "html",
  "json",
  "rs",
  "go",
  "rb",
  "sh",
  "bash",
  "zsh",
  "yml",
  "yaml",
  "sql",
  "toml",
  "xml",
  "csv",
  "log",
  "env",
  "gitignore",
  "dockerignore",
  "makefile",
  "c",
  "cpp",
  "h",
  "hpp",
  "java",
  "kt",
  "swift",
  "lua",
  "r",
  "php",
]);

type FileType =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "office"
  | "code"
  | "unknown";

function getExtension(name: string) {
  const baseName = name.toLowerCase();
  if (!baseName.includes(".")) return baseName;
  return baseName.split(".").pop() ?? "";
}

function detectFileType(item: Item): FileType {
  const extension = getExtension(item.name);
  const mimeType = item.mime_type?.toLowerCase() ?? "";

  if (mimeType.startsWith("image/") || IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  if (mimeType.startsWith("video/") || VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  if (mimeType.startsWith("audio/") || AUDIO_EXTENSIONS.has(extension)) {
    return "audio";
  }
  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (OFFICE_EXTENSIONS.has(extension)) return "office";
  if (mimeType.startsWith("text/") || CODE_EXTENSIONS.has(extension)) {
    return "code";
  }
  return "unknown";
}

function PreviewSpinner() {
  return (
    <div className="flex size-full items-center justify-center">
      <span className="loading loading-ring loading-lg" />
    </div>
  );
}

interface FilePreviewModalProps {
  file: Item;
  files: Item[];
  onClose: () => void;
  onNavigate: (file: Item) => void;
}

export function FilePreviewModal({
  file,
  files,
  onClose,
  onNavigate,
}: FilePreviewModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileType = useMemo(() => detectFileType(file), [file]);
  const currentIndex = useMemo(
    () => files.findIndex((candidate) => candidate.id === file.id),
    [file.id, files],
  );
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < files.length - 1;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setUrl(null);

    async function loadPreviewUrl() {
      try {
        const endpoint =
          fileType === "office"
            ? `/api/storage/office-preview?id=${encodeURIComponent(file.id)}`
            : `/api/storage/download?id=${encodeURIComponent(file.id)}`;
        let response = await fetch(endpoint, { signal: controller.signal });
        let attempts = 0;
        while (
          fileType === "office" &&
          response.status === 202 &&
          attempts < 150
        ) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (controller.signal.aborted) return;
          response = await fetch(endpoint, { signal: controller.signal });
          attempts += 1;
        }
        if (response.status === 202) {
          throw new Error(
            "This Office preview is still converting. Try again shortly.",
          );
        }
        const result = (await response.json()) as {
          url?: string;
          error?: string;
        };
        if (!response.ok || !result.url) {
          throw new Error(result.error || "Unable to create a preview URL");
        }
        setUrl(result.url);
      } catch (previewError) {
        if (controller.signal.aborted) return;
        setError(
          previewError instanceof Error
            ? previewError.message
            : "Failed to load preview",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadPreviewUrl();
    return () => controller.abort();
  }, [file.id, fileType]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  const navigatePrevious = useCallback(() => {
    if (hasPrevious) onNavigate(files[currentIndex - 1]);
  }, [currentIndex, files, hasPrevious, onNavigate]);

  const navigateNext = useCallback(() => {
    if (hasNext) onNavigate(files[currentIndex + 1]);
  }, [currentIndex, files, hasNext, onNavigate]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (event.target instanceof Element &&
          event.target.closest("[data-preview-interactive]"))
      ) {
        return;
      }

      if (event.key === "ArrowLeft") navigatePrevious();
      if (event.key === "ArrowRight") navigateNext();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateNext, navigatePrevious, onClose]);

  const downloadUrl = `/api/storage/download?action=download&download=true&id=${encodeURIComponent(file.id)}`;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="file-preview-title"
      className="fixed inset-0 z-[100] flex flex-col bg-base-300/95 backdrop-blur-sm"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-base-content/10 bg-base-300 px-3 py-2 md:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-xs tabular-nums text-base-content/50 md:text-sm">
            {currentIndex + 1} / {files.length}
          </span>
          <h2
            id="file-preview-title"
            className="truncate text-sm font-medium"
            title={file.name}
          >
            {file.name}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            className="btn btn-ghost btn-sm"
            href={downloadUrl}
            title="Download"
          >
            Download
          </a>
          <button
            ref={closeButtonRef}
            type="button"
            className="btn btn-ghost btn-sm btn-square"
            onClick={onClose}
            title="Close (Escape)"
            aria-label="Close file preview"
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {hasPrevious && (
          <button
            type="button"
            className="btn btn-circle btn-sm absolute left-2 z-20 border-base-content/10 bg-base-100/80 shadow-md md:btn-md"
            onClick={navigatePrevious}
            title="Previous file"
            aria-label="Preview previous file"
          >
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            className="btn btn-circle btn-sm absolute right-2 z-20 border-base-content/10 bg-base-100/80 shadow-md md:btn-md"
            onClick={navigateNext}
            title="Next file"
            aria-label="Preview next file"
          >
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}

        <div className="flex size-full items-center justify-center p-3 md:p-6">
          {loading ? (
            <PreviewSpinner />
          ) : error ? (
            <PreviewError message={error} downloadUrl={downloadUrl} />
          ) : url ? (
            <PreviewContent
              file={file}
              fileType={fileType}
              url={url}
              downloadUrl={downloadUrl}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

function PreviewError({
  message,
  downloadUrl,
}: {
  message: string;
  downloadUrl: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-error">{message}</p>
      <a className="btn btn-sm btn-primary" href={downloadUrl}>
        Download instead
      </a>
    </div>
  );
}

function PreviewContent({
  file,
  fileType,
  url,
  downloadUrl,
}: {
  file: Item;
  fileType: FileType;
  url: string;
  downloadUrl: string;
}) {
  switch (fileType) {
    case "image":
      return <ImagePreview url={url} name={file.name} />;
    case "video":
      return <VideoPreview url={url} name={file.name} />;
    case "audio":
      return <AudioPreview url={url} name={file.name} />;
    case "pdf":
      return <PdfPreview url={url} name={file.name} />;
    case "office":
      return <PdfPreview url={url} name={file.name} />;
    case "code":
      return <CodePreview itemId={file.id} name={file.name} />;
    default:
      return (
        <div className="flex flex-col items-center gap-4 text-center text-base-content/60">
          <svg
            aria-hidden="true"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          <p className="text-sm font-medium">
            Preview is not available for this file type.
          </p>
          <a className="btn btn-sm btn-primary" href={downloadUrl}>
            Download file
          </a>
        </div>
      );
  }
}
