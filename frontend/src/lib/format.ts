import type { Condition } from "@/lib/catalog-types";

const wholePeso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});
const exactPeso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

/** 2350000 centavos -> "₱23,500". Free items show "Free". */
export function formatPrice(centavos: number): string {
  if (centavos === 0) return "Free";
  return (centavos % 100 === 0 ? wholePeso : exactPeso).format(centavos / 100);
}

export const CONDITION_LABELS: Record<Condition, string> = {
  brand_new: "Brand new",
  like_new: "Like new",
  lightly_used: "Lightly used",
  well_used: "Well used",
  heavily_used: "Heavily used",
};

export const CONDITION_HINTS: Record<Condition, string> = {
  brand_new: "Never used, may still be in its packaging.",
  like_new: "Used once or twice, no visible wear.",
  lightly_used: "Used with care; flaws are barely noticeable.",
  well_used: "Visible signs of use, still works well.",
  heavily_used: "Obvious wear or defects; described in the listing.",
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" });
}
