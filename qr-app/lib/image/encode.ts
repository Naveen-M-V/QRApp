import { convertIndexedToRgb, decode as decodePng, encode as encodePng } from "fast-png";

/** Raw 8-bit RGBA image */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array; // length = width * height * 4
}

export type RasterFormat = "png" | "jpeg";

const JPEG_QUALITY = 92;

function hasCanvas(): boolean {
  return typeof document !== "undefined" && typeof document.createElement === "function";
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Composites any transparent pixels onto white (JPEG has no transparency). */
function flattenOnWhite(img: RgbaImage): RgbaImage {
  const out = new Uint8Array(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3] / 255;
    out[i] = Math.round(img.data[i] * a + 255 * (1 - a));
    out[i + 1] = Math.round(img.data[i + 1] * a + 255 * (1 - a));
    out[i + 2] = Math.round(img.data[i + 2] * a + 255 * (1 - a));
    out[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}

/** Encodes raw RGBA pixels as a PNG or JPEG data URL (works in browser and Node). */
export async function encodeRgba(img: RgbaImage, format: RasterFormat): Promise<string> {
  if (format === "png") {
    const png = encodePng({ width: img.width, height: img.height, data: img.data, channels: 4, depth: 8 });
    return `data:image/png;base64,${bytesToBase64(png)}`;
  }
  const flat = flattenOnWhite(img);
  if (hasCanvas()) {
    const canvas = document.createElement("canvas");
    canvas.width = flat.width;
    canvas.height = flat.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const imageData = ctx.createImageData(flat.width, flat.height);
      imageData.data.set(flat.data);
      ctx.putImageData(imageData, 0, 0);
      return canvas.toDataURL("image/jpeg", JPEG_QUALITY / 100);
    }
  }
  const { encode: encodeJpeg } = await import("jpeg-js");
  const jpg = encodeJpeg({ width: flat.width, height: flat.height, data: flat.data }, JPEG_QUALITY);
  return `data:image/jpeg;base64,${bytesToBase64(new Uint8Array(jpg.data))}`;
}

/** Decodes a PNG data URL into 8-bit RGBA pixels. */
export function decodePngDataUrl(dataUrl: string): RgbaImage {
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  const png = decodePng(base64ToBytes(b64));
  const { width, height } = png;
  // Indexed (palette) images are expanded to RGB/RGBA first
  const src: ArrayLike<number> = png.palette ? convertIndexedToRgb(png) : png.data;
  const channels = png.palette ? src.length / (width * height) : png.channels;
  const scale = !png.palette && png.depth === 16 ? 257 : 1;
  const data = new Uint8Array(width * height * 4);

  for (let p = 0; p < width * height; p++) {
    const o = p * channels;
    let r: number, g: number, b: number, a: number;
    if (channels === 1 || channels === 2) {
      r = g = b = src[o] / scale;
      a = channels === 2 ? src[o + 1] / scale : 255;
    } else {
      r = src[o] / scale;
      g = src[o + 1] / scale;
      b = src[o + 2] / scale;
      a = channels === 4 ? src[o + 3] / scale : 255;
    }
    data[p * 4] = r;
    data[p * 4 + 1] = g;
    data[p * 4 + 2] = b;
    data[p * 4 + 3] = a;
  }
  return { width, height, data };
}

/** Converts a PNG data URL to a JPEG data URL with a white background. */
export async function pngDataUrlToJpeg(pngDataUrl: string): Promise<string> {
  return encodeRgba(decodePngDataUrl(pngDataUrl), "jpeg");
}
