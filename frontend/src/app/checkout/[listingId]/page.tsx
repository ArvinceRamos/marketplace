import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Page } from "@/components/ui/layout";
import { CheckoutView } from "./checkout-view";

export const metadata: Metadata = { title: "Checkout · Marketplace", robots: { index: false } };

type Props = PageProps<"/checkout/[listingId]">;

const UUID = /^[0-9a-f-]{36}$/i;

export default function CheckoutPage({ params, searchParams }: Props) {
  return (
    <Page title="Checkout" width="narrow">
      <Suspense fallback={<p aria-busy="true">Loading…</p>}>
        <Loader params={params} searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function Loader({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ listingId }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(listingId)) notFound();
  const offer = typeof query.offer === "string" && UUID.test(query.offer) ? query.offer : null;
  return <CheckoutView key={`${listingId}-${offer}`} listingId={listingId} offerId={offer} />;
}
