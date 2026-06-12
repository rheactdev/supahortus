"use client";

import { Highlight, Prism, themes } from "prism-react-renderer";
import { useEffect, useMemo, useState } from "react";

const HIGHLIGHT_LIMIT = 256 * 1024;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bash: "bash",
  c: "c",
  cjs: "javascript",
  cpp: "cpp",
  css: "css",
  dockerignore: "bash",
  env: "bash",
  gitignore: "bash",
  go: "go",
  h: "c",
  hpp: "cpp",
  html: "markup",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  kt: "kotlin",
  lua: "lua",
  makefile: "makefile",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  php: "php",
  py: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  swift: "swift",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  xml: "markup",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

interface CodePreviewProps {
  itemId: string;
  name: string;
}

type TextPreviewResponse = {
  content?: string;
  truncated?: boolean;
  bytesRead?: number;
  error?: string;
};

function getExtension(name: string) {
  const lowerName = name.toLowerCase();
  if (!lowerName.includes(".")) return lowerName;
  return lowerName.split(".").pop() ?? "";
}

export function CodePreview({ itemId, name }: CodePreviewProps) {
  const [content, setContent] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setContent("");
    setTruncated(false);

    async function loadText() {
      try {
        const response = await fetch(
          `/api/storage/preview-text?id=${encodeURIComponent(itemId)}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as TextPreviewResponse;
        if (!response.ok || typeof result.content !== "string") {
          throw new Error(result.error || "Unable to load text preview");
        }
        setContent(result.content);
        setTruncated(Boolean(result.truncated));
      } catch (previewError) {
        if (controller.signal.aborted) return;
        setError(
          previewError instanceof Error
            ? previewError.message
            : "Unable to load text preview",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadText();
    return () => controller.abort();
  }, [itemId]);

  const language = LANGUAGE_BY_EXTENSION[getExtension(name)];
  const shouldHighlight =
    Boolean(language && Prism.languages[language]) &&
    content.length <= HIGHLIGHT_LIMIT;
  const lines = useMemo(() => content.split("\n"), [content]);

  if (loading) {
    return (
      <div className="flex size-full items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-error">{error}</p>;
  }

  return (
    <div
      data-preview-interactive
      tabIndex={0}
      className="size-full min-h-0 overflow-auto rounded-lg border border-base-content/10 bg-[#0d1117] text-sm text-[#e6edf3] outline-none focus:ring-2 focus:ring-primary"
      aria-label={`Text preview of ${name}`}
    >
      {(truncated || !shouldHighlight) && (
        <div className="sticky top-0 z-10 border-b border-white/10 bg-[#161b22] px-4 py-2 text-xs text-[#8b949e]">
          {truncated
            ? "Showing the first 1 MiB of this file."
            : "Large or unrecognized file shown as plain text."}
        </div>
      )}
      {shouldHighlight ? (
        <Highlight
          theme={themes.vsDark}
          code={content}
          language={language}
        >
          {({ tokens, getLineProps, getTokenProps }) => (
            <pre className="min-w-max p-4 font-mono leading-6">
              {tokens.map((line, lineIndex) => (
                <div
                  key={lineIndex}
                  {...getLineProps({ line })}
                  className="table-row"
                >
                  <span className="table-cell select-none pr-5 text-right text-[#6e7681]">
                    {lineIndex + 1}
                  </span>
                  <span className="table-cell">
                    {line.map((token, tokenIndex) => (
                      <span
                        key={tokenIndex}
                        {...getTokenProps({ token })}
                      />
                    ))}
                  </span>
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      ) : (
        <pre className="min-w-max p-4 font-mono leading-6">
          {lines.map((line, lineIndex) => (
            <div key={lineIndex} className="table-row">
              <span className="table-cell select-none pr-5 text-right text-[#6e7681]">
                {lineIndex + 1}
              </span>
              <span className="table-cell whitespace-pre">{line || " "}</span>
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}
