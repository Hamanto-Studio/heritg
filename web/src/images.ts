export const MAX_IMAGE_INPUT_BYTES = 12 * 1024 * 1024;
export const MAX_IMAGE_OUTPUT_BYTES = 512 * 1024;
export const MAX_IMAGE_DIMENSION = 1024;

const MAX_SOURCE_PIXELS = 50_000_000;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageOptions {
  crop?: ImageCrop;
  maxDimension?: number;
  maxOutputBytes?: number;
  quality?: number;
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}

const sniffImageType = async (file: File): Promise<string | undefined> => {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value
    )
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
};

const decodeImage = async (file: File): Promise<DecodedImage> => {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close()
      };
    } catch {
      // Some browsers expose createImageBitmap but cannot decode every supported format with it.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("The image could not be decoded."));
      image.src = objectUrl;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const canvasBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("JPEG encoding failed."))),
      "image/jpeg",
      quality
    );
  });

const blobDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("JPEG encoding failed."));
    reader.onerror = () => reject(new Error("JPEG encoding failed."));
    reader.readAsDataURL(blob);
  });

const positiveInteger = (value: number, minimum: number, maximum: number, label: string) => {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`);
  }
  return value;
};

export async function processImage(file: File, options: ImageOptions = {}): Promise<string> {
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a non-empty image file.");
  if (file.size > MAX_IMAGE_INPUT_BYTES) throw new Error("The image is larger than 12 MB.");

  const declaredType = file.type.toLowerCase();
  const detectedType = await sniffImageType(file);
  if (!detectedType || (declaredType && !ALLOWED_TYPES.has(declaredType))) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (declaredType && declaredType !== detectedType) {
    throw new Error("The image content does not match its media type.");
  }

  const maxDimension = positiveInteger(
    options.maxDimension ?? MAX_IMAGE_DIMENSION,
    64,
    2048,
    "Maximum image dimension"
  );
  const maxOutputBytes = positiveInteger(
    options.maxOutputBytes ?? MAX_IMAGE_OUTPUT_BYTES,
    16 * 1024,
    2 * 1024 * 1024,
    "Maximum output size"
  );
  const quality = options.quality ?? 0.84;
  if (!Number.isFinite(quality) || quality < 0.45 || quality > 0.95) {
    throw new Error("JPEG quality must be between 0.45 and 0.95.");
  }

  let decoded: DecodedImage;
  try {
    decoded = await decodeImage(file);
  } catch {
    throw new Error("The image could not be decoded.");
  }

  try {
    if (
      decoded.width < 1 ||
      decoded.height < 1 ||
      decoded.width > 32_768 ||
      decoded.height > 32_768 ||
      decoded.width * decoded.height > MAX_SOURCE_PIXELS
    ) {
      throw new Error("The image dimensions are invalid or too large.");
    }

    const side = Math.min(decoded.width, decoded.height);
    const crop = options.crop ?? {
      x: (decoded.width - side) / 2,
      y: (decoded.height - side) / 2,
      width: side,
      height: side
    };
    if (
      ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite) ||
      crop.x < 0 ||
      crop.y < 0 ||
      crop.width <= 0 ||
      crop.height <= 0 ||
      crop.x + crop.width > decoded.width ||
      crop.y + crop.height > decoded.height
    ) {
      throw new Error("The crop rectangle is outside the image.");
    }

    const scale = Math.min(1, maxDimension / Math.max(crop.width, crop.height));
    let width = Math.max(1, Math.round(crop.width * scale));
    let height = Math.max(1, Math.round(crop.height * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is not available in this browser.");

    while (width >= 1 && height >= 1) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(
        decoded.source,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        width,
        height
      );
      for (let candidate = quality; candidate >= 0.45; candidate -= 0.1) {
        const blob = await canvasBlob(canvas, candidate);
        if (blob.size <= maxOutputBytes) return blobDataUrl(blob);
      }
      width = Math.floor(width * 0.8);
      height = Math.floor(height * 0.8);
    }
    throw new Error("The image could not be compressed to the requested size.");
  } finally {
    decoded.close?.();
  }
}

export function safeFilename(name: string, extension?: string): string {
  if (typeof name !== "string" || name.length > 512) throw new Error("Invalid filename.");
  const suffix = extension?.replace(/^\./, "").toLowerCase();
  if (suffix !== undefined && !/^[a-z0-9]{1,10}$/.test(suffix)) {
    throw new Error("Invalid filename extension.");
  }
  let base = name.normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "");
  if (suffix && base.toLowerCase().endsWith(`.${suffix}`)) {
    base = base.slice(0, -(suffix.length + 1));
  }
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `_${base}`;
  base = base.slice(0, 100 - (suffix ? suffix.length + 1 : 0)).replace(/[. ]+$/g, "") || "heritg-export";
  return suffix ? `${base}.${suffix}` : base;
}

export function downloadBlob(blob: Blob, filename: string): void {
  if (!(blob instanceof Blob) || blob.size > 32 * 1024 * 1024) {
    throw new Error("Download is too large.");
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename(filename);
  anchor.rel = "noopener";
  anchor.hidden = true;
  document.body?.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(
  text: string,
  filename: string,
  type = "text/plain;charset=utf-8"
): void {
  if (new TextEncoder().encode(text).byteLength > 32 * 1024 * 1024) {
    throw new Error("Download is too large.");
  }
  downloadBlob(new Blob([text], { type }), filename);
}
