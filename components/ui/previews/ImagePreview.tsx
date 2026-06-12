"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from "react";

interface ImagePreviewProps {
  url: string;
  name: string;
}

type Point = { x: number; y: number };

export function ImagePreview({ url, name }: ImagePreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragOriginRef = useRef<Point | null>(null);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState<number | "fit">("fit");
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });

  useEffect(() => {
    setScale("fit");
    setPan({ x: 0, y: 0 });
  }, [url]);

  const fitScale = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !naturalSize.width || !naturalSize.height) return 1;
    return Math.min(
      viewport.clientWidth / naturalSize.width,
      viewport.clientHeight / naturalSize.height,
      1,
    );
  }, [naturalSize]);

  const setNumericScale = useCallback(
    (nextScale: number) => {
      setScale(Math.min(8, Math.max(0.1, nextScale)));
      setPan({ x: 0, y: 0 });
    },
    [],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const currentScale = scale === "fit" ? fitScale() : scale;
      setNumericScale(currentScale * factor);
    },
    [fitScale, scale, setNumericScale],
  );

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scale === "fit") return;
    dragOriginRef.current = {
      x: event.clientX - pan.x,
      y: event.clientY - pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragOriginRef.current) return;
    setPan({
      x: event.clientX - dragOriginRef.current.x,
      y: event.clientY - dragOriginRef.current.y,
    });
  };

  const stopDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragOriginRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const numericScale = scale === "fit" ? null : scale;

  return (
    <div className="flex size-full min-h-0 flex-col overflow-hidden rounded-lg bg-black/15">
      <div
        ref={viewportRef}
        data-preview-interactive
        className={`relative min-h-0 flex-1 touch-none ${
          scale === "fit" ? "" : "cursor-grab active:cursor-grabbing"
        }`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        {/* A raw image preserves the original signed object without optimization. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          draggable={false}
          onLoad={(event) =>
            setNaturalSize({
              width: event.currentTarget.naturalWidth,
              height: event.currentTarget.naturalHeight,
            })
          }
          className={
            scale === "fit"
              ? "absolute left-1/2 top-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 object-contain"
              : "absolute left-1/2 top-1/2 max-w-none select-none"
          }
          style={
            numericScale
              ? {
                  width: naturalSize.width * numericScale,
                  height: naturalSize.height * numericScale,
                  transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
                }
              : undefined
          }
        />
      </div>

      <div className="relative z-30 flex h-16 shrink-0 items-center justify-center">
        <div className="relative z-30 flex items-center rounded-full bg-neutral px-2 py-1 text-neutral-content shadow-xl">
          <button
            type="button"
            className="btn btn-circle btn-ghost btn-sm text-xl font-light"
            onClick={() => zoomBy(1 / 1.25)}
            aria-label="Zoom out"
          >
            <span aria-hidden="true">−</span>
          </button>
          <button
            type="button"
            className="btn btn-circle btn-ghost btn-sm"
            onClick={() => {
              if (scale === "fit") {
                setNumericScale(1);
              } else {
                setScale("fit");
                setPan({ x: 0, y: 0 });
              }
            }}
            aria-label={
              scale === "fit" ? "View at actual size" : "Fit image to window"
            }
            title={`${Math.round((numericScale ?? fitScale()) * 100)}%`}
          >
            <svg
              aria-hidden="true"
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
            >
              <circle cx="10.5" cy="10.5" r="5.5" />
              <path d="m15 15 4.5 4.5M8 10.5h5" />
              {scale !== "fit" && <path d="M10.5 8v5" />}
            </svg>
          </button>
          <button
            type="button"
            className="btn btn-circle btn-ghost btn-sm text-2xl font-light"
            onClick={() => zoomBy(1.25)}
            aria-label="Zoom in"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>
    </div>
  );
}
