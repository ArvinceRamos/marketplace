import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/ui/layout";
import { getCategories, getLocations } from "@/lib/catalog";
import { SellForm } from "./sell-form";

export const metadata: Metadata = { title: "Sell an item · Marketplace", robots: { index: false } };

export default function SellPage() {
  return (
    <Page title="Sell an item" width="prose">
      <Suspense fallback={<p aria-busy="true">Loading…</p>}>
        <SellFormWithOptions />
      </Suspense>
    </Page>
  );
}

// Categories and cities are public data, fetched on the server at request time.
async function SellFormWithOptions() {
  const [categories, locations] = await Promise.all([getCategories(), getLocations()]);
  return <SellForm categories={categories} locations={locations} />;
}
