"use client";

import type { ComponentProps } from "react";
import { isStorageTransferUrl, prepareStorageTransfer } from "@/lib/storage-transfer-client";

export function StorageDownloadLink({ href, ...props }: ComponentProps<"a">) {
  return <a {...props} href={href} onClick={async (event) => {
    props.onClick?.(event);
    if (event.defaultPrevented || !href || !isStorageTransferUrl(href)) return;
    event.preventDefault();
    try {
      window.location.assign(await prepareStorageTransfer(href));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Encrypted download is unavailable.");
    }
  }} />;
}
