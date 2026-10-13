"use client";

import { useEffect, useRef, useState } from "react";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import {
  CONDITIONS,
  COURIERS,
  PAYMENT_METHODS,
  type CategoryNode,
  type ListingDetail,
  type Location,
} from "@/lib/catalog-types";
import { COURIER_LABELS, PAYMENT_LABELS, sizesFor } from "@/lib/deal-options";
import { CONDITION_HINTS, CONDITION_LABELS } from "@/lib/format";
import { pesosInput, type FieldErrors } from "@/lib/selling";

type Props = {
  categories: CategoryNode[];
  locations: Location[];
  initial?: ListingDetail;
  errors: FieldErrors;
};

const legendClass = "mb-1 text-small font-medium text-fg";
const optionClass = "flex min-h-11 items-center gap-3 px-1 text-small";

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={id} className="text-caption text-danger">
      {error}
    </p>
  ) : null;
}

/**
 * The listing's fields. Values are read from FormData on submit; the only state is what
 * changes which fields show: the category (size list) and meetup/delivery (deal options).
 */
export function ListingFields({ categories, locations, initial, errors }: Props) {
  const start = {
    category: String(initial?.category.id ?? ""),
    meetup: initial ? initial.meetup : true,
    delivery: initial?.delivery ?? false,
  };
  const [category, setCategory] = useState(start.category);
  const [meetup, setMeetup] = useState(start.meetup);
  const [delivery, setDelivery] = useState(start.delivery);
  const sizes = sizesFor(categories, category);
  const box = useRef<HTMLDivElement>(null);

  // The sell form calls form.reset() after a submit; follow it.
  useEffect(() => {
    const form = box.current?.closest("form");
    const onReset = () => {
      setCategory(start.category);
      setMeetup(start.meetup);
      setDelivery(start.delivery);
    };
    form?.addEventListener("reset", onReset);
    return () => form?.removeEventListener("reset", onReset);
  }, [start.category, start.meetup, start.delivery]);

  return (
    <div ref={box} className="contents">
      <TextField
        label="Title"
        name="title"
        defaultValue={initial?.title}
        maxLength={80}
        placeholder="e.g. iPhone 13, 128GB, blue"
        hint="Brand, model, size, or color help buyers find it."
        error={errors.title}
        required
      />

      <SelectField
        label="Category"
        name="category_id"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        error={errors.category_id}
        required
      >
        <option value="" disabled>
          Choose a category
        </option>
        {categories.map((parent) => (
          <optgroup key={parent.id} label={parent.name}>
            {parent.children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
      </SelectField>

      {sizes.length > 0 && (
        <SelectField
          // A new category brings a new size list, so start that list empty.
          key={category}
          label="Size (optional)"
          name="size"
          defaultValue={category === start.category ? (initial?.size ?? "") : ""}
          hint="Buyers can filter by size."
          error={errors.size}
        >
          <option value="">No size</option>
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectField>
      )}
      {sizes.length === 0 && errors.size && <FieldError id="field-size-error" error={errors.size} />}

      <fieldset
        className="flex flex-col gap-1"
        aria-describedby={errors.condition ? "field-condition-error" : undefined}
      >
        <legend className={legendClass}>Condition</legend>
        {CONDITIONS.map((c) => (
          <label
            key={c}
            className="flex min-h-11 items-start gap-3 rounded-sm px-1 py-2 hover:bg-ink-100"
          >
            <input
              type="radio"
              name="condition"
              value={c}
              defaultChecked={initial?.condition === c}
              className="mt-0.5 size-5 shrink-0 accent-accent"
              required
            />
            <span className="flex flex-col">
              <span className="text-small font-medium text-fg">{CONDITION_LABELS[c]}</span>
              <span className="text-caption text-fg-muted">{CONDITION_HINTS[c]}</span>
            </span>
          </label>
        ))}
        <FieldError id="field-condition-error" error={errors.condition} />
      </fieldset>

      <TextField
        label="Price (₱)"
        name="price"
        inputMode="decimal"
        autoComplete="off"
        defaultValue={initial ? pesosInput(initial.price_centavos) : undefined}
        placeholder="e.g. 1500"
        hint="Whole pesos or with centavos. Enter 0 to give it away."
        error={errors.price_centavos}
        required
      />

      <TextArea
        label="Description"
        name="description"
        defaultValue={initial?.description}
        maxLength={5000}
        rows={6}
        hint="Say what's included and any defects. Don't share your phone number or address."
        error={errors.description}
      />

      <SelectField
        label="City"
        name="city_id"
        defaultValue={initial?.city.id ?? ""}
        hint="Only the city is shown, never your address."
        error={errors.city_id}
        required
      >
        <option value="" disabled>
          Choose a city
        </option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.city}, {l.province}
          </option>
        ))}
      </SelectField>

      <fieldset
        className="flex flex-col gap-1"
        aria-describedby={errors.meetup ? "field-meetup-error" : undefined}
      >
        <legend className={legendClass}>How can buyers get it?</legend>
        <label className={optionClass}>
          <input
            type="checkbox"
            name="meetup"
            checked={meetup}
            onChange={(e) => setMeetup(e.target.checked)}
            className="size-5 accent-accent"
          />
          Meetup
        </label>
        <label className={optionClass}>
          <input
            type="checkbox"
            name="delivery"
            checked={delivery}
            onChange={(e) => setDelivery(e.target.checked)}
            className="size-5 accent-accent"
          />
          Delivery (arranged with the buyer)
        </label>
        <FieldError id="field-meetup-error" error={errors.meetup} />
      </fieldset>

      <fieldset
        className="flex flex-col gap-1"
        aria-describedby={`field-payment-hint${errors.payment_methods ? " field-payment-error" : ""}`}
      >
        <legend className={legendClass}>Payment you accept (optional)</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {PAYMENT_METHODS.filter((m) => (m === "cod" ? delivery : m === "cash" ? meetup : true)).map(
            (m) => (
              <label key={m} className={optionClass}>
                <input
                  type="checkbox"
                  name="payment_methods"
                  value={m}
                  defaultChecked={initial?.payment_methods.includes(m)}
                  className="size-5 accent-accent"
                />
                {PAYMENT_LABELS[m]}
              </label>
            ),
          )}
        </div>
        <p id="field-payment-hint" className="text-caption text-fg-muted">
          Buyers pay you directly. Marketplace never handles money; never share a one-time PIN.
        </p>
        <FieldError id="field-payment-error" error={errors.payment_methods} />
      </fieldset>

      {delivery && (
        <fieldset
          className="flex flex-col gap-1"
          aria-describedby={errors.couriers ? "field-couriers-error" : undefined}
        >
          <legend className={legendClass}>Couriers you use (optional)</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {COURIERS.map((c) => (
              <label key={c} className={optionClass}>
                <input
                  type="checkbox"
                  name="couriers"
                  value={c}
                  defaultChecked={initial?.couriers.includes(c)}
                  className="size-5 accent-accent"
                />
                {COURIER_LABELS[c]}
              </label>
            ))}
          </div>
          <FieldError id="field-couriers-error" error={errors.couriers} />
        </fieldset>
      )}

      <TextField
        label="Meetup or delivery note (optional)"
        name="deal_note"
        defaultValue={initial?.deal_note ?? ""}
        maxLength={200}
        placeholder="e.g. SM North EDSA, weekends"
        hint="A public place is safest."
        error={errors.deal_note}
      />
    </div>
  );
}
