"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { FavoriteButton } from "@/components/favorite-button";
import { ShareButton } from "@/components/share-button";
import type { ListingImage } from "@/lib/catalog-types";
import { useListingViewer } from "./viewer-context";

const BADGE: Partial<Record<string, string>> = { sold: "Sold", reserved: "Reserved" };

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

const pill = "rounded-full bg-ink-950/80 px-2.5 py-1 text-caption font-medium text-white";
const roundButton = "grid size-11 place-items-center rounded-full bg-surface text-fg shadow-sm hover:bg-ink-100";

/**
 * Phones: full-width swipe with a live "1 / 8" counter, Share and Save on the photo.
 * Desktop: thumbnail strip, main photo with arrows, and a full-screen viewer with zoom.
 */
export function Gallery({
  listingId,
  title,
  images,
}: {
  listingId: string;
  title: string;
  images: ListingImage[];
}) {
  const { status, isOwner } = useListingViewer();
  const [current, setCurrent] = useState(0);
  const [open, setOpen] = useState(false);
  const n = images.length;
  const badge = BADGE[status];
  const go = useCallback((d: number) => setCurrent((c) => (c + d + n) % n), [n]);
  const close = useCallback(() => setOpen(false), []);

  if (n === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong px-6 text-center lg:h-60">
        <p className="text-small font-medium">No photos</p>
        <p className="text-caption text-fg-muted">
          {isOwner
            ? "Listings with photos get more chats. Add some from Edit."
            : "The seller hasn't added photos yet. Ask for some in the chat."}
        </p>
      </div>
    );
  }

  const alt = (i: number) => (i === 0 ? title : `${title}, photo ${i + 1}`);

  return (
    <>
      {/* Phones and tablets: swipe */}
      <div className="relative -mx-4 md:-mx-5 lg:hidden">
        <ul
          aria-label={`${n} photos`}
          onScroll={(e) => {
            const el = e.currentTarget;
            setCurrent(Math.round(el.scrollLeft / el.clientWidth));
          }}
          className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((img, i) => (
            <li key={img.id} className="relative aspect-[4/5] w-full shrink-0 snap-start bg-ink-100 sm:aspect-square">
              <Image src={img.full_url} alt={alt(i)} fill priority={i === 0} sizes="100vw" className="object-cover" />
            </li>
          ))}
        </ul>
        {badge && <span className={`absolute top-3 left-3 ${pill}`}>{badge}</span>}
        <div className="absolute top-3 right-3 flex gap-2">
          <ShareButton path={`/listing/${listingId}`} title={title} variant="overlay" />
          {!isOwner && <FavoriteButton listingId={listingId} title={title} variant="round" />}
        </div>
        {n > 1 && (
          <span className={`absolute right-3 bottom-3 ${pill}`} data-numeric>
            {current + 1} / {n}
          </span>
        )}
      </div>

      {/* Desktop: thumbnails + main photo */}
      <div className={`hidden gap-3 lg:grid ${n > 1 ? "grid-cols-[4rem_minmax(0,1fr)]" : ""}`}>
        {n > 1 && (
          <ul className="flex flex-col gap-2" aria-label="Photos">
            {images.map((img, i) => (
              <li key={img.id}>
                <button
                  type="button"
                  onClick={() => setCurrent(i)}
                  aria-label={`Show photo ${i + 1}${i === 0 ? " (cover)" : ""}`}
                  aria-current={i === current ? "true" : undefined}
                  className={`relative block h-20 w-16 overflow-hidden rounded-sm border-2 ${
                    i === current ? "border-ink-950" : "border-transparent hover:border-border-strong"
                  }`}
                >
                  <Image src={img.thumb_url} alt="" fill sizes="64px" className="object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="media-frame">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Open photo ${current + 1} full screen`}
            className="absolute inset-0 cursor-zoom-in"
          >
            <Image
              src={images[current].full_url}
              alt={alt(current)}
              fill
              priority
              sizes="(min-width: 80rem) 640px, 55vw"
              className="object-cover"
            />
          </button>
          {badge && <span className={`pointer-events-none absolute top-3 left-3 ${pill}`}>{badge}</span>}
          {n > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className={`absolute top-1/2 left-3 -translate-y-1/2 ${roundButton}`}>
                <Chevron dir="left" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Next photo" className={`absolute top-1/2 right-3 -translate-y-1/2 ${roundButton}`}>
                <Chevron dir="right" />
              </button>
              <span className={`pointer-events-none absolute right-3 bottom-3 ${pill}`} data-numeric>
                {current + 1} / {n}
              </span>
            </>
          )}
        </div>
      </div>

      {open && (
        <Lightbox images={images} title={title} current={current} onPick={setCurrent} go={go} onClose={close} />
      )}
    </>
  );
}

/** Full-screen photo viewer: arrows and Esc on the keyboard, click the photo to zoom. */
function Lightbox({
  images,
  title,
  current,
  onPick,
  go,
  onClose,
}: {
  images: ListingImage[];
  title: string;
  current: number;
  onPick: (i: number) => void;
  go: (d: number) => void;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const n = images.length;
  const zoom = zoomed === current;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [go, onClose]);

  const dark = "grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photos of ${title}`}
      className="fixed inset-0 z-50 grid grid-rows-[4rem_minmax(0,1fr)_5.5rem] bg-ink-950/95 text-white"
    >
      <div className="flex items-center justify-between px-5">
        <span className="text-small font-medium" data-numeric>
          {current + 1} / {n}
        </span>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className={dark}>
          <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="flex min-h-0 items-center justify-center gap-4 px-5 md:gap-8">
        {n > 1 && (
          <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className={dark}>
            <Chevron dir="left" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setZoomed(zoom ? null : current)}
          aria-label={zoom ? "Zoom out" : "Zoom in"}
          className={`relative h-full w-full max-w-3xl overflow-hidden ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"}`}
        >
          <Image
            src={images[current].full_url}
            alt={current === 0 ? title : `${title}, photo ${current + 1}`}
            fill
            sizes="(min-width: 48rem) 768px, 100vw"
            className={`object-contain transition-transform duration-150 ease-standard ${zoom ? "scale-200" : ""}`}
          />
        </button>
        {n > 1 && (
          <button type="button" onClick={() => go(1)} aria-label="Next photo" className={dark}>
            <Chevron dir="right" />
          </button>
        )}
      </div>
      <ul className="flex items-center justify-center gap-2 overflow-x-auto px-5">
        {images.map((img, i) => (
          <li key={img.id}>
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === current ? "true" : undefined}
              className={`relative block h-15 w-12 overflow-hidden rounded-sm border-2 ${
                i === current ? "border-white" : "border-transparent"
              }`}
            >
              <Image src={img.thumb_url} alt="" fill sizes="48px" className="object-cover" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
