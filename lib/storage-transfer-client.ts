"use client";

import { useEffect, useState } from "react";
import { STORAGE_TRANSFER_PATH } from "./storage-transfer-url";

export function isStorageTransferUrl(url?: string) {
  return url?.startsWith(STORAGE_TRANSFER_PATH + "?") ?? false;
}

let activation: Promise<void> | undefined;

export async function prepareStorageTransfer(url: string) {
  if (!isStorageTransferUrl(url)) return url;
  if (!("serviceWorker" in navigator)) {
    throw new Error("Encrypted transfers require a browser with service worker support.");
  }
  activation ??= activateWorker().catch((error) => {
    activation = undefined;
    throw error;
  });
  await activation;
  return url;
}

async function activateWorker() {
  const workers = navigator.serviceWorker;
  try {
    await workers.register("/hortus-transfer-worker.js", { scope: "/" });
  } catch {
    throw new Error("The encrypted transfer worker could not be registered.");
  }
  if (workers.controller?.scriptURL.endsWith("/hortus-transfer-worker.js")) return;

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      workers.removeEventListener("controllerchange", checkController);
      reject(new Error("The encrypted transfer worker could not start. Reload and try again."));
    }, 8000);
    function checkController() {
      if (!workers.controller?.scriptURL.endsWith("/hortus-transfer-worker.js")) return;
      window.clearTimeout(timer);
      workers.removeEventListener("controllerchange", checkController);
      resolve();
    }
    workers.addEventListener("controllerchange", checkController);
    checkController();
  });
}

export function useStorageThumbnail(url?: string) {
  const [readyUrl, setReadyUrl] = useState<string>();
  useEffect(() => {
    if (!url || !isStorageTransferUrl(url)) return;
    let active = true;
    prepareStorageTransfer(url).then(
      () => { if (active) setReadyUrl(url); },
      () => { if (active) setReadyUrl(undefined); },
    );
    return () => { active = false; };
  }, [url]);
  return isStorageTransferUrl(url) ? (readyUrl === url ? url : undefined) : url;
}
