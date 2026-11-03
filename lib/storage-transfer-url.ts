export const STORAGE_TRANSFER_PATH = "/api/storage/transfer";

export function storageTransferUrl(
  id: string,
  asset: "original" | "thumbnail",
  options: { download?: boolean; share?: string } = {},
) {
  const params = new URLSearchParams({ id, asset });
  if (options.download) params.set("download", "true");
  if (options.share) params.set("share", options.share);
  return `${STORAGE_TRANSFER_PATH}?${params}`;
}


export function storageKeyMarker(key: string) {
  return key.slice(key.lastIndexOf("/") + 1)
    .match(/^\.ssec~([a-zA-Z0-9_]{1,32})~[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}~/);
}

export function isEncryptedObject(key: string) {
  return storageKeyMarker(key) !== null;
}
