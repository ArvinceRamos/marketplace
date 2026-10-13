import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Page } from "@/components/ui/layout";
import { getCategories, getLocations } from "@/lib/catalog";
import { EditListing } from "./edit-listing";

export const metadata: Metadata = { title: "Edit listing · Marketplace", robots: { index: false } };

type Props = PageProps<"/my-listings/[id]/edit">;

// Set by the sell page when the draft was saved but a later step failed.
const NOTICES: Record<string, string> = {
  photo_failed:
    "Your listing was saved as a draft, but a photo could not be uploaded. Add it again below.",
  publish_failed:
    "Your listing was saved as a draft but not published. Check the photos, then publish it.",
};

export default function EditListingPage(props: Props) {
  return (
    <Page title="Edit listing" width="prose">
      <Suspense fallback={<p aria-busy="true">Loading…</p>}>
        <EditListingLoader {...props} />
      </Suspense>
    </Page>
  );
}

async function EditListingLoader({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Fixed messages only: text from the URL is never shown, so a crafted link can't
  // put its own words on this page.
  const code = typeof query.notice === "string" ? query.notice : "";
  const notice = Object.hasOwn(NOTICES, code) ? NOTICES[code] : null;
  const [categories, locations] = await Promise.all([getCategories(), getLocations()]);
  return (
    <EditListing id={id} notice={notice} categories={categories} locations={locations} />
  );
}
