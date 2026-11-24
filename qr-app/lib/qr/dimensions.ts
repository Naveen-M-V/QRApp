export type SizeUnit = "px" | "in" | "cm";

export interface DimensionCalculation {
  pixels: number;
  inches: number;
  cm: number;
  mm: number;
  dpi: number;
  displayText: string;
}

export const SIZE_PRESETS: Record<SizeUnit, { label: string; value: number }[]> = {
  px: [
    { label: "Small (300 px)", value: 300 },
    { label: "Medium (600 px)", value: 600 },
    { label: "Large (1200 px)", value: 1200 },
  ],
  in: [
    { label: "ID Card (1.0 in)", value: 1.0 },
    { label: "Medium (1.5 in)", value: 1.5 },
    { label: "Standard (2.0 in)", value: 2.0 },
    { label: "Large (3.0 in)", value: 3.0 },
  ],
  cm: [
    { label: "Compact (2.5 cm)", value: 2.5 },
    { label: "Standard (3.8 cm)", value: 3.8 },
    { label: "Medium (5.0 cm)", value: 5.0 },
    { label: "Large (7.5 cm)", value: 7.5 },
  ],
};

/**
 * Converts any dimension value (in px, in, or cm) to pixels at the specified DPI (default: 300 DPI)
 */
export function convertToPixels(value: number, unit: SizeUnit = "px", dpi: number = 300): number {
  const safeDpi = dpi > 0 ? dpi : 300;
  const safeVal = Math.max(0.1, Number(value) || 0);

  if (unit === "in") {
    return Math.max(50, Math.round(safeVal * safeDpi));
  }
  if (unit === "cm") {
    return Math.max(50, Math.round((safeVal / 2.54) * safeDpi));
  }
  // Default is pixels
  return Math.max(50, Math.round(safeVal));
}

/**
 * Converts a pixel dimension to a target unit (in, cm, or px) at the specified DPI
 */
export function convertFromPixels(pixels: number, targetUnit: SizeUnit, dpi: number = 300): number {
  const safeDpi = dpi > 0 ? dpi : 300;
  const safePx = Math.max(50, Number(pixels) || 300);

  if (targetUnit === "in") {
    return Number((safePx / safeDpi).toFixed(2));
  }
  if (targetUnit === "cm") {
    return Number(((safePx / safeDpi) * 2.54).toFixed(2));
  }
  return Math.round(safePx);
}

/**
 * Calculates a complete dimensional breakdown across inches, centimeters, millimeters, and pixels
 */
export function calculateDimensions(
  value: number,
  unit: SizeUnit = "px",
  dpi: number = 300
): DimensionCalculation {
  const pixels = convertToPixels(value, unit, dpi);
  const inches = Number((pixels / dpi).toFixed(2));
  const cm = Number(((pixels / dpi) * 2.54).toFixed(2));
  const mm = Number(((pixels / dpi) * 25.4).toFixed(1));

  const displayText = `${inches} in · ${cm} cm · ${pixels} px @ ${dpi} DPI`;

  return {
    pixels,
    inches,
    cm,
    mm,
    dpi,
    displayText,
  };
}
