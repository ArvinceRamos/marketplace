"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ListingActions } from "@/components/selling/listing-actions";
import { ListingFields } from "@/components/selling/listing-fields";
import { PhotoGrid } from "@/components/selling/photo-grid";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import type { CategoryNode, ListingDetail, Location } from "@/lib/catalog-types";
import {
  MAX_PHOTOS,
  checkPhoto,
  friendlyFields,
  readListingForm,
  type FieldErrors,
  type ListingStatus,
} from "@/lib/selling";

const STATUS_TEXT: Record<ListingStatus, string> = {
  draft: "Draft — only you can see it.",
  active: "Live — buyers can see it.",
  paused: "Paused — hidden from search.",
  sold: "Sold — shown as sold.",
  reserved: "Reserved — an order is in progress. Manage it in Orders.",
};

const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Edit a listing. Photo changes save right away; text changes save with the button. */
export function EditListing({
  id,
  notice,
  categories,
  locations,
}: {
  id: string;
  notice: string | null;
  categories: CategoryNode[];
  locations: Location[];
}) {
  const router = useRouter();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(notice);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Runs again whenever this page becomes visible, so the data is never stale.
  useEffect(() => {
    apiFetch<ListingDetail>(`/listings/${id}`)
      .then((l) => (l.is_owner ? setListing(l) : setMissing(true)))
      .catch((e: unknown) =>
        e instanceof ApiError && e.status === 404
          ? setMissing(true)
          : setAlert(message(e, "Could not load this listing.")),
      );
  }, [id, attempt]);

  if (missing) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-body text-fg-muted">This listing doesn&apos;t exist or isn&apos;t yours.</p>
        <ButtonLink href="/my-listings" variant="secondary">
          Back to my listings
        </ButtonLink>
      </div>
    );
  }
  if (!listing) {
    if (!alert) return <p aria-busy="true">Loading…</p>;
    return (
      <LoadError
        message={alert}
        onRetry={() => {
          setAlert(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  async function addPhotos(files: File[]) {
    if (!listing) return;
    const problems = files.map(checkPhoto).filter((m): m is string => m !== null);
    const good = files.filter((f) => checkPhoto(f) === null);
    const room = MAX_PHOTOS - listing.images.length;
    if (good.length > room) problems.push(`You can add ${room} more photo${room === 1 ? "" : "s"}.`);
    setPhotoError(problems.join(" ") || null);
    setBusy(true);
    for (const [index, file] of good.slice(0, room).entries()) {
      setPhotoStatus(`Uploading photo ${index + 1} of ${Math.min(good.length, room)}…`);
      const body = new FormData();
      body.append("files", file);
      try {
        setListing(await apiFetch<ListingDetail>(`/listings/${id}/images`, { method: "POST", body }));
      } catch (e) {
        setPhotoError(message(e, "A photo could not be uploaded."));
        break;
      }
    }
    setPhotoStatus(null);
    setBusy(false);
  }

  async function photoChange(path: string, init: RequestInit, done: string) {
    setBusy(true);
    setPhotoError(null);
    try {
      setListing(await apiFetch<ListingDetail>(path, init));
      setPhotoStatus(done);
    } catch (e) {
      setPhotoError(message(e, "Could not change the photos."));
    } finally {
      setBusy(false);
    }
  }

  function removePhoto(imageId: string) {
    void photoChange(`/listings/${id}/images/${imageId}`, { method: "DELETE" }, "Photo removed.");
  }

  function movePhoto(imageId: string, by: -1 | 1) {
    if (!listing) return;
    const ids = listing.images.map((i) => i.id);
    const from = ids.indexOf(imageId);
    [ids[from], ids[from + by]] = [ids[from + by], ids[from]];
    void photoChange(
      `/listings/${id}/images/order`,
      { method: "PATCH", body: JSON.stringify({ image_ids: ids }) },
      "Photo moved.",
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { input, errors: found } = readListingForm(new FormData(event.currentTarget));
    setErrors(found);
    if (!input) {
      setAlert("Please fix the highlighted fields.");
      return;
    }
    setBusy(true);
    setAlert(null);
    try {
      const saved = await apiFetch<ListingDetail>(`/listings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      router.push(saved.status === "draft" ? "/my-listings?status=draft" : `/listing/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        setErrors(friendlyFields(e.fields));
        setAlert("Please fix the highlighted fields.");
      } else {
        setAlert(message(e, "Could not save. Please try again."));
      }
    } finally {
      setBusy(false);
    }
  }

  function statusChanged(next: ListingStatus | "deleted") {
    if (next === "deleted") router.push(`/my-listings?status=${listing!.status}`);
    else setListing({ ...listing!, status: next });
  }

  return (
    <div className="flex flex-col gap-6">
      <FormAlert message={alert} />

      <section
        aria-label="Listing status"
        className="flex flex-col gap-3 rounded-md border border-border p-4"
      >
        <p className="text-small">
          <span className="font-medium">Status: </span>
          {STATUS_TEXT[listing.status]}
        </p>
        <ListingActions listingId={id} status={listing.status} onDone={statusChanged} />
      </section>

      <PhotoGrid
        photos={listing.images.map((i) => ({ id: i.id, src: i.thumb_url }))}
        onAdd={addPhotos}
        onRemove={removePhoto}
        onMove={movePhoto}
        busy={busy}
        status={photoStatus}
        error={photoError}
      />

      {/* Re-mount with fresh values whenever the saved listing changes. */}
      <form key={listing.updated_at} onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <ListingFields
          categories={categories}
          locations={locations}
          initial={listing}
          errors={errors}
        />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ButtonLink href={`/my-listings?status=${listing.status}`} variant="secondary">
            Cancel
          </ButtonLink>
          <Button type="submit" disabled={busy}>
            {busy ? "Working…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
