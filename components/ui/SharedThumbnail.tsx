"use client";

import { FileIcon } from "@/components/icons/liquid-glass";
import { useStorageThumbnail } from "@/lib/storage-transfer-client";

export function SharedThumbnail({ url }: { url?: string }) {
  const src = useStorageThumbnail(url);
  if (!src) return <FileIcon size={42} className="text-base-content/35" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="size-full object-contain transition-transform group-hover:scale-[1.02]" />;
}
