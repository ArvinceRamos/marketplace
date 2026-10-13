"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ListingFields } from "@/components/selling/listing-fields";
import { PhotoGrid, type PhotoTile } from "@/components/selling/photo-grid";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { ApiError, apiFetch } from "@/lib/api";
import type { CategoryNode, ListingDetail, Location } from "@/lib/catalog-types";
import {
  MAX_PHOTOS,
  checkPhoto,
  friendlyFields,
  readListingForm,
  type FieldErrors,
} from "@/lib/selling";

type LocalPhoto = PhotoTile & { file: File };

let nextId = 0;

/**
 * Photos are kept in the browser until the seller submits. Then: create the draft,
 * upload photos one by one (so progress is visible and one failure keeps the rest),
 * and publish if asked.
 */
export function SellForm({
  categories,
  locations,
}: {
  categories: CategoryNode[];
  locations: Location[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Free preview memory when photos are dropped or the page goes away.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  });
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.src)), []);

  function addPhotos(files: File[]) {
    const room = MAX_PHOTOS - photos.length;
    const problems = files.map(checkPhoto).filter((m): m is string => m !== null);
    const good = files.filter((f) => checkPhoto(f) === null).slice(0, room);
    if (files.length - problems.length > room) {
      problems.push(`Only ${MAX_PHOTOS} photos are allowed; extra ones were skipped.`);
    }
    setErrors((e) => ({ ...e, photos: problems.join(" ") || undefined }));
    setPhotos((current) => [
      ...current,
      ...good.map((file) => ({ id: `local-${nextId++}`, file, src: URL.createObjectURL(file) })),
    ]);
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      current.filter((p) => p.id === id).forEach((p) => URL.revokeObjectURL(p.src));
      return current.filter((p) => p.id !== id);
    });
  }

  function movePhoto(id: string, by: -1 | 1) {
    setPhotos((current) => {
      const from = current.findIndex((p) => p.id === id);
      const to = from + by;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  function reset() {
    formRef.current?.reset();
    photos.forEach((p) => URL.revokeObjectURL(p.src));
    setPhotos([]);
    setErrors({});
    setAlert(null);
    setStatus(null);
    setPending(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const publish = submitter?.value === "publish";
    const { input, errors: found } = readListingForm(new FormData(event.currentTarget));
    if (publish && photos.length === 0) found.photos = "Add at least one photo to publish.";
    setErrors(found);
    if (!input || found.photos) {
      setAlert("Please fix the highlighted fields.");
      return;
    }

    setPending(true);
    setAlert(null);
    let listing: ListingDetail;
    try {
      setStatus("Saving your listing…");
      listing = await apiFetch<ListingDetail>("/listings", {
        method: "POST",
        body: JSON.stringify(input),
      });
    } catch (e) {
      setStatus(null);
      setPending(false);
      if (e instanceof ApiError && e.fields) {
        setErrors(friendlyFields(e.fields));
        setAlert("Please fix the highlighted fields.");
      } else {
        setAlert(e instanceof ApiError ? e.message : "Could not save. Please try again.");
      }
      return;
    }

    // The draft exists now. Upload photos in order; stop at the first failure.
    let failed: "photo_failed" | "publish_failed" | null = null;
    for (const [index, photo] of photos.entries()) {
      setStatus(`Uploading photo ${index + 1} of ${photos.length}…`);
      const body = new FormData();
      body.append("files", photo.file);
      try {
        await apiFetch(`/listings/${listing.id}/images`, { method: "POST", body });
      } catch {
        failed = "photo_failed";
        break;
      }
    }

    let published = false;
    if (publish && !failed) {
      try {
        setStatus("Publishing…");
        await apiFetch(`/listings/${listing.id}/status`, {
          method: "POST",
          body: JSON.stringify({ status: "active" }),
        });
        published = true;
      } catch {
        failed = "publish_failed";
      }
    }

    reset(); // this page stays mounted in the background; start fresh next time
    if (failed) {
      router.push(`/my-listings/${listing.id}/edit?notice=${failed}`);
    } else if (published) {
      router.push(`/listing/${listing.id}`);
    } else {
      router.push("/my-listings?status=draft");
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <FormAlert message={alert} />
      <PhotoGrid
        photos={photos}
        onAdd={addPhotos}
        onRemove={removePhoto}
        onMove={movePhoto}
        busy={pending}
        status={status}
        error={errors.photos}
      />
      <ListingFields categories={categories} locations={locations} errors={errors} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" name="intent" value="draft" variant="secondary" disabled={pending}>
          Save as draft
        </Button>
        <Button type="submit" name="intent" value="publish" disabled={pending}>
          {pending ? "Working…" : "Publish"}
        </Button>
      </div>
    </form>
  );
}
