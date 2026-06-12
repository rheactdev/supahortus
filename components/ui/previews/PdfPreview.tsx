"use client";

import { PDFViewer } from "@embedpdf/react-pdf-viewer";

interface PdfPreviewProps {
  url: string;
  name: string;
}

export function PdfPreview({ url, name }: PdfPreviewProps) {
  return (
    <div
      data-preview-interactive
      className="size-full min-h-0 overflow-hidden rounded-lg border border-base-content/10 bg-base-100"
      aria-label={`PDF preview of ${name}`}
    >
      <PDFViewer
        key={url}
        style={{ width: "100%", height: "100%" }}
        config={{
          src: url,
          tabBar: "never",
          theme: { preference: "system" },
          fontFallback: null,
          disabledCategories: [
            "annotation",
            "redaction",
            "insert",
            "form",
            "document-open",
            "document-close",
            "document-protect",
          ],
        }}
      />
    </div>
  );
}
