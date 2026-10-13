"use client";

import { useId, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { CONDITIONS, COURIERS, PAYMENT_METHODS, type CategoryNode, type Location } from "@/lib/catalog-types";
import { COURIER_LABELS, PAYMENT_LABELS, sizesFor } from "@/lib/deal-options";
import { CONDITION_LABELS } from "@/lib/format";
import type { Filters } from "@/lib/search-params";

const SORT_LABELS = {
  relevance: "Best match",
  newest: "Newest first",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
} as const;

/** Keep shared URLs clean: empty fields are not submitted (disabled fields are skipped). */
function dropEmptyFields(event: FormEvent<HTMLFormElement>) {
  const fields = Array.from(event.currentTarget.elements).filter(
    (el): el is HTMLInputElement | HTMLSelectElement =>
      (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) &&
      el.name !== "" &&
      el.value === "",
  );
  fields.forEach((el) => (el.disabled = true));
  // Re-enable in case the page is restored from the back/forward cache.
  setTimeout(() => fields.forEach((el) => (el.disabled = false)), 0);
}

/** A group of checkboxes that all submit under one URL parameter. */
function CheckGroup({
  legend,
  name,
  options,
  checked,
  columns = 1,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  checked: string[];
  columns?: 1 | 3;
}) {
  return (
    <fieldset className="flex flex-col">
      <legend className="mb-1 text-small font-medium">{legend}</legend>
      <div className={columns === 3 ? "grid grid-cols-3 gap-x-2" : "flex flex-col"}>
        {options.map((o) => (
          <label key={o.value} className="flex min-h-10 items-center gap-3 text-small text-fg">
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={checked.includes(o.value)}
              className="size-5 shrink-0 accent-accent"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const selectClass =
  "min-h-11 w-full rounded-sm border border-border-strong bg-surface px-3 text-body text-fg " +
  "focus-visible:border-accent focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-accent";

/**
 * Filters as a plain GET form: every choice ends up in the URL.
 * Phones: collapsed behind a "Filters" button. Desktop: always-open sidebar.
 */
export function FilterPanel({
  action,
  filters,
  categories,
  locations,
  showCategory,
}: {
  action: string;
  filters: Filters;
  categories: CategoryNode[];
  locations: Location[];
  showCategory: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // Size filter only on a subcategory that has sizes (e.g. Shoes, Women's Fashion).
  const sizes = sizesFor(categories, filters.category);
  const active =
    (filters.min_price !== undefined ? 1 : 0) +
    (filters.max_price !== undefined ? 1 : 0) +
    filters.condition.length +
    (filters.city ? 1 : 0) +
    (showCategory && filters.category ? 1 : 0) +
    (sizes.length > 0 ? filters.size.length : 0) +
    filters.payment.length +
    filters.courier.length;

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="secondary"
        className="lg:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Hide filters" : "Filters & sort"}
        {active > 0 && (
          <span className="rounded-full bg-accent px-2 text-caption text-fg-on-brand">{active}</span>
        )}
      </Button>

      <form
        id={panelId}
        action={action}
        onSubmit={dropEmptyFields}
        className={`${open ? "flex" : "hidden"} flex-col gap-5 lg:flex`}
      >
        {filters.q && <input type="hidden" name="q" value={filters.q} />}

        <label className="flex flex-col gap-1 text-small font-medium">
          Sort by
          <select
            name="sort"
            defaultValue={filters.sort}
            className={selectClass}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            {(Object.keys(SORT_LABELS) as (keyof typeof SORT_LABELS)[])
              .filter((s) => s !== "relevance" || filters.q)
              .map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
          </select>
        </label>

        {showCategory && (
          <label className="flex flex-col gap-1 text-small font-medium">
            Category
            <select name="category" defaultValue={filters.category ?? ""} className={selectClass}>
              <option value="">All categories</option>
              {categories.map((parent) => (
                <optgroup key={parent.slug} label={parent.name}>
                  <option value={parent.slug}>All {parent.name}</option>
                  {parent.children.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-small font-medium">Price (₱)</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="sr-only" htmlFor={`${panelId}-min`}>
              Minimum price
            </label>
            <input
              id={`${panelId}-min`}
              name="min_price"
              type="number"
              inputMode="numeric"
              min={0}
              max={100000000}
              placeholder="Min"
              defaultValue={filters.min_price}
              className={selectClass}
            />
            <label className="sr-only" htmlFor={`${panelId}-max`}>
              Maximum price
            </label>
            <input
              id={`${panelId}-max`}
              name="max_price"
              type="number"
              inputMode="numeric"
              min={0}
              max={100000000}
              placeholder="Max"
              defaultValue={filters.max_price}
              className={selectClass}
            />
          </div>
        </fieldset>

        {sizes.length > 0 && (
          <CheckGroup
            legend="Size"
            name="size"
            options={sizes.map((v) => ({ value: v, label: v }))}
            checked={filters.size}
            columns={sizes.length > 6 ? 3 : 1}
          />
        )}

        <CheckGroup
          legend="Condition"
          name="condition"
          options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
          checked={filters.condition}
        />

        <label className="flex flex-col gap-1 text-small font-medium">
          Location
          <select name="city" defaultValue={filters.city ?? ""} className={selectClass}>
            <option value="">All of the Philippines</option>
            {locations.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.city}
              </option>
            ))}
          </select>
        </label>

        <CheckGroup
          legend="Payment"
          name="payment"
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_LABELS[m] }))}
          checked={filters.payment}
        />

        <CheckGroup
          legend="Ships via"
          name="courier"
          options={COURIERS.map((c) => ({ value: c, label: COURIER_LABELS[c] }))}
          checked={filters.courier}
        />

        <div className="flex gap-2">
          <Button type="submit" fullWidth>
            Apply
          </Button>
          <ButtonLink
            href={filters.q ? `${action}?q=${encodeURIComponent(filters.q)}` : action}
            variant="ghost"
          >
            Clear
          </ButtonLink>
        </div>
      </form>
    </div>
  );
}
