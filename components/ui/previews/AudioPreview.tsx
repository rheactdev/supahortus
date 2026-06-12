"use client";

import React from "react";
import { Music } from "@/components/icons/liquid-glass";

interface AudioPreviewProps {
  url: string;
  name: string;
}

export function AudioPreview({ url, name }: AudioPreviewProps) {
  return (
    <div
      data-preview-interactive
      className="flex size-full items-center justify-center"
    >
      <div className="bg-base-200 p-8 rounded-2xl flex flex-col items-center gap-6 max-w-md w-full shadow-sm border border-base-content/5">
        <div className="p-4 bg-primary/10 text-primary rounded-full">
          <Music size={48} />
        </div>
        <div className="text-center w-full">
          <h3 className="font-semibold text-lg truncate px-4" title={name}>
            {name}
          </h3>
          <p className="text-sm text-base-content/50 mt-1">Audio File</p>
        </div>
        <audio
          src={url}
          controls
          autoPlay
          className="w-full outline-none"
        >
          Your browser does not support the audio element.
        </audio>
      </div>
    </div>
  );
}
