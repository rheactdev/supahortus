"use client";

import { useEffect, useRef, useState } from "react";
import { PdfIcon } from "@/components/icons/liquid-glass";
import type {
  PDFDocumentLoadingTask,
  RenderTask,
} from "pdfjs-dist";

interface PdfThumbnailProps {
  itemId: string;
  name: string;
  fit: "cover" | "contain";
}

export function PdfThumbnail({ itemId, name, fit }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof IntersectionObserver === "undefined") {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldRender) return;

    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    let renderTask: RenderTask | undefined;

    async function renderFirstPage() {
      setStatus("loading");

      try {
        const previewResponse = await fetch(
          `/api/storage/download?id=${encodeURIComponent(itemId)}`,
        );
        if (!previewResponse.ok) {
          throw new Error("Unable to create a PDF preview URL");
        }
        const { url } = (await previewResponse.json()) as { url: string };

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const task = pdfjs.getDocument({
          url,
          maxImageSize: 16_000_000,
        });
        loadingTask = task;

        const document = await task.promise;
        const page = await document.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.5, 720 / baseViewport.width);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;

        if (cancelled || !canvas) return;

        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvas, viewport });
        await renderTask.promise;

        if (!cancelled) setStatus("ready");
      } catch (error) {
        if (!cancelled) {
          console.warn(`Unable to render PDF preview for ${name}`, error);
          setStatus("error");
        }
      }
    }

    void renderFirstPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
    };
  }, [itemId, name, shouldRender]);

  if (status === "error") {
    return (
      <div className="p-3 bg-primary/10 rounded-lg text-primary">
        <PdfIcon size={32} />
      </div>
    );
  }

  return (
    <>
      {status === "loading" && (
        <span className="loading loading-spinner loading-sm text-primary" />
      )}
      <canvas
        ref={canvasRef}
        aria-label={`Preview of ${name}`}
        className={`absolute inset-0 size-full ${
          fit === "contain" ? "object-contain" : "object-cover"
        } ${status === "ready" ? "opacity-100" : "opacity-0"}`}
      />
    </>
  );
}
