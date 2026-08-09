import { ImageIcon, RotateCcw, ZoomIn } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { processImage } from "./images";
import type { Translator } from "./i18n";
import { Modal } from "./ui";

interface PhotoCropDialogProps {
  file: File;
  t: Translator;
  onCancel: () => void;
  onConfirm: (photoDataUrl: string) => void;
  onError: (message: string) => void;
}

interface Point { x: number; y: number }
interface ImageSize { width: number; height: number }

const clampOffset = (offset: Point, image: ImageSize, viewport: number, zoom: number): Point => {
  if (!viewport || !image.width || !image.height) return { x: 0, y: 0 };
  const baseScale = Math.max(viewport / image.width, viewport / image.height);
  const displayedWidth = image.width * baseScale * zoom;
  const displayedHeight = image.height * baseScale * zoom;
  return {
    x: Math.max((viewport - displayedWidth) / 2, Math.min((displayedWidth - viewport) / 2, offset.x)),
    y: Math.max((viewport - displayedHeight) / 2, Math.min((displayedHeight - viewport) / 2, offset.y))
  };
};

export function PhotoCropDialog({ file, t, onCancel, onConfirm, onError }: PhotoCropDialogProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point } | undefined>(undefined);
  const [image, setImage] = useState<ImageSize>();
  const [viewport, setViewport] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [objectUrl, setObjectUrl] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () => setViewport(element.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (image) setOffset((current) => clampOffset(current, image, viewport, zoom));
  }, [image, viewport, zoom]);

  const confirm = async () => {
    if (!image || !viewport) return;
    setSaving(true);
    try {
      const baseScale = Math.max(viewport / image.width, viewport / image.height);
      const scale = baseScale * zoom;
      const side = viewport / scale;
      const centerX = image.width / 2 - offset.x / scale;
      const centerY = image.height / 2 - offset.y / scale;
      const photo = await processImage(file, {
        crop: {
          x: Math.max(0, Math.min(image.width - side, centerX - side / 2)),
          y: Math.max(0, Math.min(image.height - side, centerY - side / 2)),
          width: side,
          height: side
        }
      });
      onConfirm(photo);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : t("errorTitle"));
    } finally {
      setSaving(false);
    }
  };

  const imageStyle = image && viewport ? (() => {
    const scale = Math.max(viewport / image.width, viewport / image.height) * zoom;
    return {
      height: image.height * scale,
      transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
      width: image.width * scale
    };
  })() : undefined;

  return (
    <Modal
      closeLabel={t("close")}
      footer={(
        <>
          <button className="button secondary" disabled={saving} onClick={onCancel} type="button">{t("cancel")}</button>
          <button className="button primary" disabled={!image || saving} onClick={() => void confirm()} type="button">
            {saving ? t("processingPhoto") : t("usePhoto")}
          </button>
        </>
      )}
      onClose={onCancel}
      size="medium"
      title={t("cropPhoto")}
    >
      <div className="photo-crop-dialog">
        <p>{t("cropPhotoDetail")}</p>
        <div
          aria-label={t("cropPhoto")}
          className="photo-crop-viewport"
          onPointerDown={(event) => {
            if (!image) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = {
              pointerId: event.pointerId,
              start: { x: event.clientX, y: event.clientY },
              origin: offset
            };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId || !image) return;
            setOffset(clampOffset({
              x: drag.origin.x + event.clientX - drag.start.x,
              y: drag.origin.y + event.clientY - drag.start.y
            }, image, viewport, zoom));
          }}
          onPointerUp={(event) => {
            if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined;
          }}
          ref={viewportRef}
          role="img"
        >
          {!image ? <ImageIcon aria-hidden="true" size={32} /> : null}
          <img
            alt=""
            draggable={false}
            onError={() => onError(t("photoDecodeError"))}
            onLoad={(event) => setImage({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight
            })}
            src={objectUrl || undefined}
            style={imageStyle}
          />
          <span className="photo-crop-mask" aria-hidden="true" />
        </div>
        <div className="photo-crop-controls">
          <ZoomIn aria-hidden="true" size={18} />
          <label>
            <span className="sr-only">{t("photoZoom")}</span>
            <input
              aria-label={t("photoZoom")}
              max="4"
              min="1"
              onChange={(event) => setZoom(Number(event.target.value))}
              step="0.05"
              type="range"
              value={zoom}
            />
          </label>
          <button
            className="icon-button quiet small"
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={17} />
            <span className="sr-only">{t("resetPhotoCrop")}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
