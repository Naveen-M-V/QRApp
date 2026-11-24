import JsBarcode from "jsbarcode";
import { SizeUnit } from "@/types";
import { convertToPixels } from "@/lib/qr/dimensions";
import { encodeRgba, RasterFormat } from "@/lib/image/encode";

export type BarcodeFormat = "CODE128" | "CODE39";

export interface BarcodeSettings {
  format?: BarcodeFormat;
  height?: number; // bar height in pixels (legacy layout only)
  sizeUnit?: SizeUnit; // 'px' | 'in' | 'cm'
  sizeValue?: number; // total barcode WIDTH in sizeUnit
  widthScale?: number; // pixels per module (legacy layout only, default 2)
  displayValue?: boolean; // show human-readable text below bars
  fontSize?: number; // font size for text (legacy layout only)
  margin?: number; // quiet zone in pixels (legacy layout only)
  background?: string; // background color
  lineColor?: string; // bar color
  transparent?: boolean; // transparent background (PNG / SVG)
  dpi?: number;
  imageFormat?: RasterFormat; // 'png' (default) | 'jpeg' — raster output only
}

/**
 * Escapes characters for safe inclusion in SVG markup
 */
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

/**
 * Encodes text into a binary string of bars ('1') and spaces ('0') using JsBarcode modules
 */
export function encodeBarcodeBinary(
  text: string,
  format: BarcodeFormat = "CODE128"
): { text: string; data: string } {
  const clean = (text || "000000").trim();
  const targetFormat = format === "CODE39" ? "CODE39" : "CODE128";

  const tryEncode = (fmt: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const BarcodeModule = (JsBarcode as any).getModule(fmt);
    if (!BarcodeModule) throw new Error(`Unsupported barcode format: ${fmt}`);
    const encoder = new BarcodeModule(clean, { text: clean });
    if (typeof encoder.valid === "function" && !encoder.valid()) {
      throw new Error(`"${clean}" cannot be encoded as ${fmt} (unsupported characters)`);
    }
    return encoder.encode() as { text: string; data: string };
  };

  try {
    return tryEncode(targetFormat);
  } catch (err) {
    // Fallback to Code 128 if format failed (e.g. CODE39 requires uppercase/allowed chars)
    if (targetFormat !== "CODE128") return tryEncode("CODE128");
    throw err;
  }
}

/**
 * Pixel layout of a barcode image.
 *
 * When a size is given (sizeValue + sizeUnit) it is the TOTAL IMAGE WIDTH in pixels
 * (inches/cm are converted at the chosen DPI). Bars use a whole number of pixels per
 * module so they stay crisp, a quiet zone of at least 10 modules is kept on each side,
 * and any leftover pixels are added to the side margins so the width is exact.
 * Height scales with width. If the requested width is too small to fit the code at
 * 1 px per module, the minimum width that fits is used instead.
 *
 * Without a size, the original fixed layout (2 px per moduleWidth, 80 px bars) is used —
 * this is what the print page and PDF sheets rely on.
 */
export interface BarcodeLayout {
  data: string;
  text: string;
  width: number;
  height: number;
  moduleWidth: number;
  marginX: number;
  marginY: number;
  barHeight: number;
  fontSize: number;
  textGap: number;
}

export function computeBarcodeLayout(text: string, settings: BarcodeSettings = {}): BarcodeLayout {
  const { format = "CODE128", displayValue = true } = settings;
  const { data, text: encodedText } = encodeBarcodeBinary(text, format);
  const len = data.length;

  if (settings.sizeValue && settings.sizeValue > 0) {
    const target = convertToPixels(settings.sizeValue, settings.sizeUnit || "px", settings.dpi || 300);
    const QUIET = 10; // modules per side
    const moduleWidth = Math.max(1, Math.floor(target / (len + 2 * QUIET)));
    const width = Math.max(target, len * moduleWidth + 2 * QUIET * moduleWidth);
    const marginX = Math.floor((width - len * moduleWidth) / 2);
    const barHeight = Math.max(30, Math.round(width * 0.3));
    const fontSize = displayValue ? Math.max(12, Math.round(width * 0.05)) : 0;
    const textGap = displayValue ? Math.max(4, Math.round(fontSize * 0.3)) : 0;
    const marginY = Math.max(6, Math.round(width * 0.03));
    const height = marginY * 2 + barHeight + textGap + fontSize;
    return { data, text: encodedText, width, height, moduleWidth, marginX, marginY, barHeight, fontSize, textGap };
  }

  // Legacy fixed layout
  const moduleWidth = settings.widthScale || 2;
  const margin = settings.margin ?? 10;
  const barHeight = settings.height || 80;
  const fontSize = displayValue ? settings.fontSize || 14 : 0;
  const textGap = displayValue ? 6 : 0;
  return {
    data,
    text: encodedText,
    width: len * moduleWidth + 2 * margin,
    height: barHeight + 2 * margin + textGap + fontSize,
    moduleWidth,
    marginX: margin,
    marginY: margin,
    barHeight,
    fontSize,
    textGap,
  };
}

/** Calls fn(x, width) for every run of consecutive bars */
function forEachBar(layout: BarcodeLayout, fn: (x: number, w: number) => void) {
  let barStart = -1;
  for (let i = 0; i <= layout.data.length; i++) {
    if (layout.data[i] === "1") {
      if (barStart === -1) barStart = i;
    } else if (barStart !== -1) {
      fn(layout.marginX + barStart * layout.moduleWidth, (i - barStart) * layout.moduleWidth);
      barStart = -1;
    }
  }
}

/**
 * Generates an SVG representation of a linear 1D barcode (Code 128 / Code 39)
 */
export function generateBarcodeSvg(text: string, settings: BarcodeSettings = {}): string {
  const { displayValue = true, background = "#ffffff", lineColor = "#000000", transparent = false } = settings;
  const layout = computeBarcodeLayout(text, settings);

  let rects = "";
  forEachBar(layout, (x, w) => {
    rects += `<rect x="${x}" y="${layout.marginY}" width="${w}" height="${layout.barHeight}" fill="${lineColor}" />`;
  });

  const textY = layout.marginY + layout.barHeight + layout.textGap + layout.fontSize * 0.85;
  const textNode = displayValue
    ? `<text x="${layout.width / 2}" y="${textY}" font-family="monospace, Courier, sans-serif" font-size="${layout.fontSize}" font-weight="600" text-anchor="middle" fill="${lineColor}">${escapeXml(layout.text)}</text>`
    : "";

  const bgNode = transparent ? "" : `<rect width="100%" height="100%" fill="${background}" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
  ${bgNode}
  ${rects}
  ${textNode}
</svg>`;
}

function parseHexColor(hex: string, fallback: [number, number, number]): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Generates a PNG (default) or JPEG data URL of the barcode for <img>, PDFs and ZIPs.
 * JPEG is always on a white background (JPEG has no transparency).
 */
export async function generateBarcodeDataUrl(text: string, settings: BarcodeSettings = {}): Promise<string> {
  const { displayValue = true, background = "#ffffff", lineColor = "#000000" } = settings;
  const imageFormat: RasterFormat = settings.imageFormat || "png";
  const transparent = imageFormat === "png" && settings.transparent === true;
  const layout = computeBarcodeLayout(text, settings);

  // 1. Browser: canvas (also renders the human-readable text)
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = layout.width;
    canvas.height = layout.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      if (!transparent) {
        ctx.fillStyle = imageFormat === "jpeg" ? "#ffffff" : background;
        ctx.fillRect(0, 0, layout.width, layout.height);
      }
      ctx.fillStyle = lineColor;
      forEachBar(layout, (x, w) => ctx.fillRect(x, layout.marginY, w, layout.barHeight));

      if (displayValue) {
        ctx.font = `600 ${layout.fontSize}px monospace, Courier, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(layout.text, layout.width / 2, layout.marginY + layout.barHeight + layout.textGap);
      }
      return imageFormat === "jpeg" ? canvas.toDataURL("image/jpeg", 0.92) : canvas.toDataURL("image/png");
    }
  }

  // 2. Node / SSR / tests: draw raw pixels (bars only — no font rendering available here)
  const [br, bg, bb] = parseHexColor(background, [255, 255, 255]);
  const [lr, lg, lb] = parseHexColor(lineColor, [0, 0, 0]);
  const rgba = new Uint8Array(layout.width * layout.height * 4);
  if (!transparent) {
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = br;
      rgba[i + 1] = bg;
      rgba[i + 2] = bb;
      rgba[i + 3] = 255;
    }
  }
  forEachBar(layout, (x0, w) => {
    for (let y = layout.marginY; y < layout.marginY + layout.barHeight; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const idx = (y * layout.width + x) * 4;
        rgba[idx] = lr;
        rgba[idx + 1] = lg;
        rgba[idx + 2] = lb;
        rgba[idx + 3] = 255;
      }
    }
  });
  return encodeRgba({ width: layout.width, height: layout.height, data: rgba }, imageFormat);
}
