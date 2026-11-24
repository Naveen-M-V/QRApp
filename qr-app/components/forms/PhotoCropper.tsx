"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Check } from "lucide-react";
import { PHOTO_HEIGHT, PHOTO_MAX_BYTES, PHOTO_WIDTH } from "@/lib/forms/schema";

const FRAME_W = 240;
const FRAME_H = Math.round((FRAME_W * PHOTO_HEIGHT) / PHOTO_WIDTH); // 3.5 x 4.5 ratio

interface Props {
  /** Called with the cropped JPEG (or null when cleared) */
  onChange: (photo: Blob | null) => void;
  error?: string;
}

/**
 * Passport-photo picker: choose / take a photo, drag and zoom it inside a 3.5×4.5 frame,
 * and get a compressed JPEG of exactly PHOTO_WIDTH × PHOTO_HEIGHT pixels.
 */
export function PhotoCropper({ onChange, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [resultUrl, setResultUrl] = useState<string>("");
  const [loadError, setLoadError] = useState("");
  const drag = useRef<{ startX: number; startY: number; x: number; y: number } | null>(null);

  const baseScale = img ? Math.max(FRAME_W / img.naturalWidth, FRAME_H / img.naturalHeight) : 1;
  const scale = baseScale * zoom;

  const clamp = useCallback(
    (x: number, y: number, s = scale) => {
      if (!img) return { x: 0, y: 0 };
      const minX = FRAME_W - img.naturalWidth * s;
      const minY = FRAME_H - img.naturalHeight * s;
      return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
    },
    [img, scale]
  );

  useEffect(() => () => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  }, [resultUrl]);

  const handleFile = (file: File | undefined) => {
    setLoadError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLoadError("Please choose a photo (JPG or PNG).");
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const s = Math.max(FRAME_W / image.naturalWidth, FRAME_H / image.naturalHeight);
      setImg(image);
      setZoom(1);
      // centre the photo
      setPos({ x: (FRAME_W - image.naturalWidth * s) / 2, y: (FRAME_H - image.naturalHeight * s) / 2 });
      setResultUrl("");
      onChange(null);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setLoadError("This photo format can't be opened here. Please use a JPG or PNG photo.");
    };
    image.src = url;
  };

  const changeZoom = (z: number) => {
    if (!img) return;
    // keep the centre of the frame fixed while zooming
    const cx = (FRAME_W / 2 - pos.x) / scale;
    const cy = (FRAME_H / 2 - pos.y) / scale;
    const ns = baseScale * z;
    setZoom(z);
    setPos(clamp(FRAME_W / 2 - cx * ns, FRAME_H / 2 - cy * ns, ns));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, x: pos.x, y: pos.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setPos(clamp(drag.current.x + e.clientX - drag.current.startX, drag.current.y + e.clientY - drag.current.startY));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const confirmCrop = async () => {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_WIDTH;
    canvas.height = PHOTO_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -pos.x / scale, -pos.y / scale, FRAME_W / scale, FRAME_H / scale, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);

    let quality = 0.9;
    let blob: Blob | null = null;
    while (quality >= 0.5) {
      blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
      if (blob && blob.size <= PHOTO_MAX_BYTES) break;
      quality -= 0.1;
    }
    if (!blob) {
      setLoadError("Could not process this photo. Please try another one.");
      return;
    }
    setResultUrl(URL.createObjectURL(blob));
    onChange(blob);
  };

  const reset = () => {
    setImg(null);
    setResultUrl("");
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
        aria-label="Choose photo"
      />

      {!img && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-sm transition-colors ${
            error ? "border-[#A11F15] bg-[#FDECEA]/40" : "border-[#C7A878] bg-[#FAF7F2] hover:bg-[#F3EADD]"
          }`}
        >
          <Camera className="w-7 h-7 text-[#632D3B]" />
          <span className="font-semibold text-[#632D3B]">Take or choose a photo</span>
          <span className="text-xs text-[#776D6A]">Passport style: face the camera, plain background, no cap or sunglasses</span>
        </button>
      )}

      {img && !resultUrl && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs text-[#776D6A]">Drag to position your face inside the oval, then zoom if needed.</p>
          <div
            className="relative overflow-hidden rounded-lg border border-[#E7DED4] bg-[#EFE6D9] touch-none select-none cursor-grab active:cursor-grabbing"
            style={{ width: FRAME_W, height: FRAME_H }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            data-testid="crop-frame"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.src}
              alt="Your photo"
              draggable={false}
              className="absolute max-w-none pointer-events-none"
              style={{
                left: pos.x,
                top: pos.y,
                width: img.naturalWidth * scale,
                height: img.naturalHeight * scale,
              }}
            />
            {/* face guide */}
            <div
              className="absolute pointer-events-none border-2 border-white/80 rounded-[50%] shadow-[0_0_0_9999px_rgba(41,35,38,0.25)]"
              style={{ left: FRAME_W * 0.2, top: FRAME_H * 0.12, width: FRAME_W * 0.6, height: FRAME_H * 0.6 }}
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-[#776D6A] w-full max-w-[240px]">
            Zoom
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => changeZoom(Number(e.target.value))}
              className="flex-1 accent-[#632D3B]"
              aria-label="Zoom"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-[#E7DED4] bg-white text-[#292326] flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Choose another
            </button>
            <button
              type="button"
              onClick={confirmCrop}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-[#632D3B] text-white flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Use this photo
            </button>
          </div>
        </div>
      )}

      {resultUrl && (
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resultUrl}
            alt="Cropped photo"
            className="rounded-md border border-[#E7DED4]"
            style={{ width: 105, height: 135 }}
            data-testid="cropped-photo"
          />
          <div className="text-xs text-[#776D6A] space-y-2">
            <p className="text-[#0F6B50] font-semibold flex items-center gap-1">
              <Check className="w-4 h-4" /> Photo ready
            </p>
            <button type="button" onClick={reset} className="underline text-[#632D3B]">
              Change photo
            </button>
          </div>
        </div>
      )}

      {(loadError || error) && <p className="mt-2 text-xs text-[#A11F15]">{loadError || error}</p>}
    </div>
  );
}
