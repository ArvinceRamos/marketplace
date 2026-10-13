import type { Metadata } from "next";
import { Page } from "@/components/ui/layout";
import { WalletView } from "./wallet-view";

export const metadata: Metadata = { title: "Wallet · Marketplace", robots: { index: false } };

export default function WalletPage() {
  return (
    <Page title="Wallet" width="narrow">
      <WalletView />
    </Page>
  );
}
