"use client";

import { useId, type ChangeEvent } from "react";
import { MAX_PHOTOS, PHOTO_ACCEPT } from "@/lib/selling";

export type PhotoTile = { id: string; src: string };

type Props = {
  photos: PhotoTile[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, by: -1 | 1) => void;
  busy?: boolean;
  status?: string | null;
  error?: string | null;
};

const tileButton =
  "grid size-9 place-items-center rounded-full bg-surface/90 text-fg shadow-sm " +
  "hover:bg-surface disabled:opacity-40";

/**
 * Photos in order; the first is the cover. Reordering uses buttons instead of
 * drag and drop, so it works the same with touch, mouse, keyboard, and screen readers.
 */
export function PhotoGrid({ photos, onAdd, onRemove, onMove, busy, status, error }: Props) {
  const inputId = useId();
  const full = photos.length >= MAX_PHOTOS;

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = ""; // allow picking the same file again
    if (files.length) onAdd(files);
  }

  return (
    <section aria-labelledby={`${inputId}-heading`} className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={`${inputId}-heading`} className="text-small font-medium text-fg">
          Photos
        </h2>
        <span className="text-caption text-fg-muted">
          {photos.length} of {MAX_PHOTOS} · first photo is the cover
        </span>
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((photo, index) => (
          <li key={photo.id} className="media-frame rounded-sm">
            {/* Local previews are blob: URLs, so a plain <img> is used. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.src} alt={`Photo ${index + 1}`} className="size-full object-cover" />
            {index === 0 && (
              <span className="absolute top-1.5 left-1.5 rounded-full bg-ink-950/80 px-2 py-0.5 text-caption font-medium text-white">
                Cover
              </span>
            )}
            <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between gap-1">
              <button
                type="button"
                className={tileButton}
                onClick={() => onMove(photo.id, -1)}
                disabled={busy || index === 0}
                aria-label={`Move photo ${index + 1} earlier`}
              >
                <span aria-hidden>←</span>
              </button>
              <button
                type="button"
                className={tileButton}
                onClick={() => onRemove(photo.id)}
                disabled={busy}
                aria-label={`Remove photo ${index + 1}`}
              >
                <span aria-hidden>✕</span>
              </button>
              <button
                type="button"
                className={tileButton}
                onClick={() => onMove(photo.id, 1)}
                disabled={busy || index === photos.length - 1}
                aria-label={`Move photo ${index + 1} later`}
              >
                <span aria-hidden>→</span>
              </button>
            </div>
          </li>
        ))}
        {!full && (
          <li>
            <label
              htmlFor={inputId}
              className="grid aspect-[4/5] cursor-pointer place-items-center rounded-sm border-2 border-dashed border-border-strong text-center text-small text-fg-muted hover:border-accent hover:text-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
            >
              <span>
                <span aria-hidden className="block text-heading">
                  +
                </span>
                Add photos
              </span>
              <input
                id={inputId}
                type="file"
                accept={PHOTO_ACCEPT}
                multiple
                onChange={pick}
                disabled={busy}
                className="sr-only"
              />
            </label>
          </li>
        )}
      </ul>

      <p className="text-caption text-fg-muted">
        JPEG, PNG, or WebP, up to 8 MB each. Location data is removed from photos.
      </p>
      <p role="status" className="text-caption text-fg-muted empty:hidden">
        {status}
      </p>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
