export function processorFileType(name: string) {
  if (/\.psd$/i.test(name)) return "psd";
  if (/\.(afdesign|afphoto|afpub|af)$/i.test(name)) return "af";
  return null;
}

export function isBrowserImage(name: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(name);
}

export function canGenerateCardThumbnail(name: string) {
  return /\.(jpe?g|png)$/i.test(name) || processorFileType(name) !== null;
}

export type ThumbnailKeys = {
  thumbnail_key?: string | null;
  card_thumbnail_key?: string | null;
};

export function needsThumbnailGeneration(name: string, keys: ThumbnailKeys) {
  return (canGenerateCardThumbnail(name) && !keys.card_thumbnail_key) ||
    (processorFileType(name) !== null && !keys.thumbnail_key);
}

export function canHaveThumbnail(name: string) {
  return isBrowserImage(name) || processorFileType(name) !== null;
}

export function getCardThumbnailKey(item: {
  name: string;
  s3_key: string;
  card_thumbnail_key: string | null;
  thumbnail_key: string | null;
}) {
  return item.card_thumbnail_key ?? item.thumbnail_key ??
    (isBrowserImage(item.name) ? item.s3_key : null);
}
