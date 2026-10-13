"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert, TextArea } from "@/components/ui/field";

/** 1–5 stars and an optional comment. One review per side, so no editing. */
export function ReviewForm({
  otherName,
  onSubmit,
}: {
  otherName: string;
  onSubmit: (rating: number, comment: string) => Promise<string | null>;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (rating < 1) {
      setError("Choose 1 to 5 stars.");
      return;
    }
    setBusy(true);
    setError(await onSubmit(rating, comment));
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-md border border-border p-4" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-small font-medium">How was dealing with {otherName}?</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer">
              <input
                type="radio"
                name="rating"
                value={n}
                checked={rating === n}
                onChange={() => setRating(n)}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                className="peer sr-only"
              />
              <span
                className={`grid size-11 place-items-center rounded-sm border text-heading peer-focus-visible:outline-2 peer-focus-visible:outline-accent ${
                  n <= rating ? "border-accent bg-accent-soft text-[#b7791f]" : "border-border text-ink-300"
                }`}
              >
                <span aria-hidden>★</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <TextArea
        label="Comment (optional)"
        name="review-comment"
        rows={3}
        maxLength={1000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        hint="Shown on their profile once you both review, or after 14 days."
      />
      <FormAlert message={error} />
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? "Sending…" : "Post review"}
      </Button>
    </form>
  );
}
