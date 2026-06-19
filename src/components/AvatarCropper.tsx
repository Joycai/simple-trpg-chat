"use client";

import { useState, useRef, useEffect } from "react";
import { uploadAvatarAction } from "@/app/actions/room";
import { useTranslations } from "next-intl";

interface AvatarCropperProps {
  roomId: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AvatarCropper({ roomId, onClose, onSuccess }: AvatarCropperProps) {
  const t = useTranslations("avatar");
  const [imageData, setImageData] = useState<string | null>(null);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropSize, setCropSize] = useState(256);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"move" | "resize">("move");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Canvas dimensions
  const canvasWidth = 400;
  const canvasHeight = 400;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError(t("errorInvalidFile"));
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError(t("errorFileTooLarge"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result as string;
      setImageData(data);
      setCropX(0);
      setCropY(0);
      setCropSize(Math.min(canvasWidth, canvasHeight));
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!imageData) return;

    const canvas = imageRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Calculate scaling to fit canvas while maintaining aspect ratio
      const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const offsetX = (canvasWidth - scaledWidth) / 2;
      const offsetY = (canvasHeight - scaledHeight) / 2;

      // Draw image
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

      // Draw crop box
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(cropX, cropY, cropSize, cropSize);
      ctx.setLineDash([]);

      // Draw crop area overlay
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      // Top
      if (cropY > 0) ctx.fillRect(0, 0, canvasWidth, cropY);
      // Left
      if (cropX > 0) ctx.fillRect(0, cropY, cropX, cropSize);
      // Right
      if (cropX + cropSize < canvasWidth) {
        ctx.fillRect(cropX + cropSize, cropY, canvasWidth - (cropX + cropSize), cropSize);
      }
      // Bottom
      if (cropY + cropSize < canvasHeight) {
        ctx.fillRect(0, cropY + cropSize, canvasWidth, canvasHeight - (cropY + cropSize));
      }
    };
    img.src = imageData;
  }, [imageData, cropX, cropY, cropSize]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = imageRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on resize handle (bottom-right corner)
    const resizeHandleSize = 20;
    if (
      x >= cropX + cropSize - resizeHandleSize &&
      x <= cropX + cropSize &&
      y >= cropY + cropSize - resizeHandleSize &&
      y <= cropY + cropSize
    ) {
      setDragMode("resize");
    } else {
      setDragMode("move");
    }
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;

    const canvas = imageRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragMode === "move") {
      let newX = x - cropSize / 2;
      let newY = y - cropSize / 2;

      // Clamp to canvas bounds
      newX = Math.max(0, Math.min(newX, canvasWidth - cropSize));
      newY = Math.max(0, Math.min(newY, canvasHeight - cropSize));

      setCropX(newX);
      setCropY(newY);
    } else if (dragMode === "resize") {
      let newSize = Math.max(50, Math.min(x - cropX, y - cropY));
      newSize = Math.min(newSize, canvasWidth - cropX, canvasHeight - cropY);
      setCropSize(newSize);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleSubmit = async () => {
    if (!imageData) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Crop the image on client side
      const croppedImage = await cropImageToBase64(imageData, cropX, cropY, cropSize, canvasWidth, canvasHeight);
      await uploadAvatarAction(roomId, croppedImage);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("errorUploadFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper function to crop the image to 512x512
  const cropImageToBase64 = (
    srcData: string,
    cropX: number,
    cropY: number,
    cropSize: number,
    srcCanvasW: number,
    srcCanvasH: number
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Calculate actual image dimensions and scale
        const scale = Math.min(srcCanvasW / img.width, srcCanvasH / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const offsetX = (srcCanvasW - scaledWidth) / 2;
        const offsetY = (srcCanvasH - scaledHeight) / 2;

        // Create canvas for cropped output at 512x512
        const outputCanvas = document.createElement("canvas");
        outputCanvas.width = 512;
        outputCanvas.height = 512;
        const ctx = outputCanvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Calculate source coordinates from the crop box
        const sourceX = (cropX - offsetX) / scale;
        const sourceY = (cropY - offsetY) / scale;
        const sourceSize = cropSize / scale;

        // Draw the cropped portion onto the output canvas
        ctx.drawImage(
          img,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          512,
          512
        );

        // Convert to base64
        resolve(outputCanvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = srcData;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface border border-border rounded-theme shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 flex justify-between items-center z-10">
          <h3 className="font-bold text-text text-lg">{t("title")}</h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text text-xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {!imageData ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-muted">{t("selectImage")}</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-4 py-3 bg-primary text-primary-text font-medium rounded-theme hover:opacity-90 transition"
              >
                {t("uploadButton")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-text-muted">{t("dragToCrop")}</p>

              <canvas
                ref={imageRef}
                width={canvasWidth}
                height={canvasHeight}
                className="w-full border border-border rounded-theme cursor-move bg-bg"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setImageData(null);
                    setCropX(0);
                    setCropY(0);
                    setCropSize(256);
                  }}
                  className="flex-1 px-4 py-2 bg-surface-alt border border-border text-text font-medium rounded-theme hover:bg-surface-alt/80 transition"
                >
                  {t("changeImage")}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-primary text-primary-text font-medium rounded-theme hover:opacity-90 disabled:opacity-50 transition"
                >
                  {isSubmitting ? t("uploading") : t("confirmButton")}
                </button>
              </div>

              {error && <p className="text-sm text-danger text-center">{error}</p>}

              <div className="bg-surface-alt border border-border rounded-theme p-3">
                <p className="text-xs text-text-muted mb-2">{t("previewLabel")}</p>
                <div className="w-24 h-24 bg-bg border border-border rounded-theme overflow-hidden">
                  <canvas
                    width={96}
                    height={96}
                    ref={(canvas) => {
                      if (!canvas || !imageData) return;
                      const ctx = canvas.getContext("2d");
                      if (!ctx) return;

                      const img = new Image();
                      img.onload = () => {
                        const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
                        const scaledWidth = img.width * scale;
                        const scaledHeight = img.height * scale;
                        const offsetX = (canvasWidth - scaledWidth) / 2;
                        const offsetY = (canvasHeight - scaledHeight) / 2;

                        ctx.fillStyle = "#1a1a1a";
                        ctx.fillRect(0, 0, 96, 96);

                        const sourceX = (cropX - offsetX) / scale;
                        const sourceY = (cropY - offsetY) / scale;
                        const sourceSize = cropSize / scale;

                        ctx.drawImage(
                          img,
                          sourceX,
                          sourceY,
                          sourceSize,
                          sourceSize,
                          0,
                          0,
                          96,
                          96
                        );
                      };
                      img.src = imageData;
                    }}
                    className="w-full h-full"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
