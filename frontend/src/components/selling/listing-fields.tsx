import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { CONDITIONS, type CategoryNode, type ListingDetail, type Location } from "@/lib/catalog-types";
import { CONDITION_HINTS, CONDITION_LABELS } from "@/lib/format";
import { pesosInput, type FieldErrors } from "@/lib/selling";

type Props = {
  categories: CategoryNode[];
  locations: Location[];
  initial?: ListingDetail;
  errors: FieldErrors;
};

const legendClass = "mb-1 text-small font-medium text-fg";

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? (
    <p id={id} className="text-caption text-danger">
      {error}
    </p>
  ) : null;
}

/** The listing's text fields. Uncontrolled: values are read from FormData on submit. */
export function ListingFields({ categories, locations, initial, errors }: Props) {
  return (
    <>
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
        defaultValue={initial?.category.id ?? ""}
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
        <label className="flex min-h-11 items-center gap-3 px-1 text-small">
          <input
            type="checkbox"
            name="meetup"
            defaultChecked={initial ? initial.meetup : true}
            className="size-5 accent-accent"
          />
          Meetup
        </label>
        <label className="flex min-h-11 items-center gap-3 px-1 text-small">
          <input
            type="checkbox"
            name="delivery"
            defaultChecked={initial?.delivery ?? false}
            className="size-5 accent-accent"
          />
          Delivery (arranged with the buyer)
        </label>
        <FieldError id="field-meetup-error" error={errors.meetup} />
      </fieldset>

      <TextField
        label="Meetup or delivery note (optional)"
        name="deal_note"
        defaultValue={initial?.deal_note ?? ""}
        maxLength={200}
        placeholder="e.g. SM North EDSA, weekends"
        hint="A public place is safest."
        error={errors.deal_note}
      />
    </>
  );
}
