export function processorFileType(name: string) {
  if (/\.psd$/i.test(name)) return "psd";
  if (/\.(afdesign|afphoto|afpub|af)$/i.test(name)) return "af";
  return null;
}

export function isBrowserImage(name: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(name);
}

export function canHaveThumbnail(name: string) {
  return isBrowserImage(name) || processorFileType(name) !== null;
}
