import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Page } from "@/components/ui/layout";
import { MockPayView } from "./mockpay-view";

export const metadata: Metadata = { title: "MockPay (test mode) · Marketplace", robots: { index: false } };

type Props = PageProps<"/pay/mock/[ref]">;

export default function MockPayPage({ params }: Props) {
  return (
    <Page title="MockPay" width="narrow">
      <Suspense fallback={<p aria-busy="true">Loading…</p>}>
        <Loader params={params} />
      </Suspense>
    </Page>
  );
}

async function Loader({ params }: Pick<Props, "params">) {
  const { ref } = await params;
  if (!/^mock_sess_[A-Za-z0-9_-]{8,60}$/.test(ref)) notFound();
  return <MockPayView key={ref} sessionRef={ref} />;
}
