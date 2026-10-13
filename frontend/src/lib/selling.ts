// Seller-side helpers: form parsing, client-side checks, and status actions.
// The API re-checks everything; these checks only give faster, friendlier feedback.
import type { Condition, Courier, ListingCard, PaymentMethod } from "@/lib/catalog-types";
import { CONDITIONS, COURIERS, PAYMENT_METHODS } from "@/lib/catalog-types";
import { fitDealOptions } from "@/lib/deal-options";

export const MAX_PHOTOS = 8;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
// Listing these types makes iPhones convert HEIC photos to JPEG when picking.
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
const PHOTO_TYPES = new Set(PHOTO_ACCEPT.split(","));
const MAX_PRICE_CENTAVOS = 10_000_000_000; // ₱100M

export type ListingStatus = ListingCard["status"];

export type ListingInput = {
  title: string;
  description: string;
  category_id: number;
  city_id: number;
  price_centavos: number;
  condition: Condition;
  meetup: boolean;
  delivery: boolean;
  deal_note: string | null;
  size: string | null;
  payment_methods: PaymentMethod[];
  couriers: Courier[];
};

export type FieldName = keyof ListingInput;
export type FieldErrors = Partial<Record<FieldName | "photos", string>>;

/** "1,500.50" or "₱1500" -> centavos. Text math, so no floating-point rounding. */
export function parsePesos(input: string): number | null {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(input.replace(/[\s,₱]/g, ""));
  if (!match) return null;
  const centavos = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return centavos <= MAX_PRICE_CENTAVOS ? centavos : null;
}

/** 150050 -> "1500.50"; 150000 -> "1500". For prefilling the price field. */
export function pesosInput(centavos: number): string {
  const pesos = Math.floor(centavos / 100);
  const rest = centavos % 100;
  return rest === 0 ? String(pesos) : `${pesos}.${String(rest).padStart(2, "0")}`;
}

const MESSAGES: Record<FieldName, string> = {
  title: "Use 3–80 characters.",
  description: "Use up to 5,000 characters.",
  category_id: "Choose a category.",
  city_id: "Choose a city.",
  price_centavos: "Enter a price from ₱0 to ₱100,000,000, e.g. 1500 or 1500.50.",
  condition: "Choose the condition.",
  meetup: "Choose meetup, delivery, or both.",
  delivery: "Choose meetup, delivery, or both.",
  deal_note: "Use up to 200 characters.",
  size: "Pick a size from the list.",
  payment_methods: "Check the payment options.",
  couriers: "Check the couriers.",
};

// Fields whose API messages are already written for people (kept as they are).
const KEEP_API_MESSAGE = new Set<FieldName>(["size", "payment_methods", "couriers"]);

/** Read and check the listing form. Returns the API body, or errors per field. */
export function readListingForm(form: FormData): { input: ListingInput | null; errors: FieldErrors } {
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const errors: FieldErrors = {};

  const title = text("title");
  if (title.length < 3 || title.length > 80) errors.title = MESSAGES.title;
  const description = text("description");
  if (description.length > 5000) errors.description = MESSAGES.description;
  const categoryId = Number(text("category_id"));
  if (!Number.isInteger(categoryId) || categoryId <= 0) errors.category_id = MESSAGES.category_id;
  const cityId = Number(text("city_id"));
  if (!Number.isInteger(cityId) || cityId <= 0) errors.city_id = MESSAGES.city_id;
  const price = parsePesos(text("price"));
  if (price === null) errors.price_centavos = MESSAGES.price_centavos;
  const condition = text("condition") as Condition;
  if (!CONDITIONS.includes(condition)) errors.condition = MESSAGES.condition;
  const meetup = form.get("meetup") === "on";
  const delivery = form.get("delivery") === "on";
  if (!meetup && !delivery) errors.meetup = MESSAGES.meetup;
  const dealNote = text("deal_note");
  if (dealNote.length > 200) errors.deal_note = MESSAGES.deal_note;
  const size = text("size");
  if (size.length > 20) errors.size = MESSAGES.size;
  // Hidden options are not submitted; fitDealOptions also drops any that no longer apply.
  const deal = fitDealOptions(
    meetup,
    delivery,
    form
      .getAll("payment_methods")
      .map(String)
      .filter((p): p is PaymentMethod => PAYMENT_METHODS.includes(p as PaymentMethod)),
    form
      .getAll("couriers")
      .map(String)
      .filter((c): c is Courier => COURIERS.includes(c as Courier)),
  );

  if (Object.keys(errors).length > 0) return { input: null, errors };
  return {
    input: {
      title,
      description,
      category_id: categoryId,
      city_id: cityId,
      price_centavos: price!,
      condition,
      meetup,
      delivery,
      deal_note: dealNote || null,
      size: size || null,
      payment_methods: deal.payments,
      couriers: deal.couriers,
    },
    errors,
  };
}

/** API field errors -> friendly text. Messages the API wrote for people are kept. */
export function friendlyFields(apiFields: Record<string, string>): FieldErrors {
  const out: FieldErrors = {};
  const ours = new Set(["Choose a subcategory.", "Choose a category.", "Choose a city."]);
  for (const [key, message] of Object.entries(apiFields)) {
    const name = key.split(".")[0] as FieldName;
    if (!(name in MESSAGES)) continue;
    out[name] = ours.has(message) || KEEP_API_MESSAGE.has(name) ? message : MESSAGES[name];
  }
  return out;
}

/** Quick check before upload. The server still verifies the real file content. */
export function checkPhoto(file: File): string | null {
  if (file.type && !PHOTO_TYPES.has(file.type)) return `${file.name}: use a JPEG, PNG, or WebP photo.`;
  if (file.size > MAX_PHOTO_BYTES) return `${file.name}: each photo must be 8 MB or smaller.`;
  return null;
}

export type StatusAction = {
  to: Exclude<ListingStatus, "draft">;
  label: string;
  confirm?: { title: string; body: string; action: string };
};

// Mirrors the server's allowed transitions (docs/USER_FLOWS.md §3).
export const STATUS_ACTIONS: Record<ListingStatus, StatusAction[]> = {
  draft: [{ to: "active", label: "Publish" }],
  active: [
    { to: "paused", label: "Pause" },
    {
      to: "sold",
      label: "Mark as sold",
      confirm: {
        title: "Mark this item as sold?",
        body: "Buyers will see it as sold and can no longer make offers. You can undo this later.",
        action: "Mark as sold",
      },
    },
  ],
  paused: [
    { to: "active", label: "Resume" },
    {
      to: "sold",
      label: "Mark as sold",
      confirm: {
        title: "Mark this item as sold?",
        body: "Buyers will see it as sold. You can undo this later.",
        action: "Mark as sold",
      },
    },
  ],
  sold: [{ to: "paused", label: "Undo sold" }],
  // Held by an order; only the order moves it (finish or cancel it in Orders).
  reserved: [],
};

// Tabs on /my-listings (docs/USER_FLOWS.md §3).
export const MY_LISTING_TABS: { status: ListingStatus; label: string; empty: string }[] = [
  { status: "active", label: "Active", empty: "Nothing live right now." },
  { status: "paused", label: "Paused", empty: "No paused listings." },
  { status: "reserved", label: "Reserved", empty: "Nothing reserved by an order." },
  { status: "sold", label: "Sold", empty: "Nothing sold yet." },
  { status: "draft", label: "Drafts", empty: "No drafts." },
];

export const DELETE_CONFIRM = {
  title: "Delete this listing?",
  body: "It will be removed from the marketplace and its photos deleted. This can't be undone.",
  action: "Delete listing",
};
