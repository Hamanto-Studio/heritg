import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";

export type AvatarImageData = {
  dataURL: DataURL;
  mimeType: BinaryFileData["mimeType"];
  fingerprint: number;
};

export type AvatarImageResolver = (
  value: string | undefined,
  size: number
) => AvatarImageData | undefined;

const stableNumber = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 1) || 1;
};

export const isValidAvatarImage = (value: string | undefined) => Boolean(value?.match(
  /^data:(image\/(?:svg\+xml|png|jpe?g|gif|webp|bmp|x-icon|avif|jfif))(?:;[^,]*)?,/i
));

const escapeXml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&apos;");

const base64Utf8 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

export const circularAvatarData = (
  value: string | undefined,
  size: number
): AvatarImageData | undefined => {
  if (!isValidAvatarImage(value)) return undefined;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><defs><clipPath id="avatar-clip"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></clipPath></defs><image href="${escapeXml(value!)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-clip)"/></svg>`;
  return {
    dataURL: `data:image/svg+xml;base64,${base64Utf8(svg)}` as DataURL,
    mimeType: "image/svg+xml",
    fingerprint: stableNumber(value!)
  };
};

export const createCircularAvatarCache = (): AvatarImageResolver => {
  const values = new Map<number, Map<string, AvatarImageData>>();
  return (value, size) => {
    if (!isValidAvatarImage(value)) return undefined;
    const sizeCache = values.get(size) ?? new Map<string, AvatarImageData>();
    values.set(size, sizeCache);
    const cached = sizeCache.get(value!);
    if (cached) return cached;
    const result = circularAvatarData(value, size);
    if (result) sizeCache.set(value!, result);
    return result;
  };
};
