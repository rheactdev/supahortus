"use client";

import React from "react";

interface VideoPreviewProps {
  url: string;
  name: string;
}

export function VideoPreview({ url, name }: VideoPreviewProps) {
  return (
    <div
      data-preview-interactive
      className="flex size-full items-center justify-center overflow-hidden rounded-lg bg-black/20"
    >
      <video
        src={url}
        controls
        autoPlay
        playsInline
        preload="metadata"
        className="max-h-full max-w-full outline-none"
        title={name}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
