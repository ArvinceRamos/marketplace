import type { Metadata } from "next";
import { Page } from "@/components/ui/layout";
import { FavoritesView } from "./favorites-view";

export const metadata: Metadata = { title: "Saved items · Marketplace", robots: { index: false } };

export default function FavoritesPage() {
  return (
    <Page title="Saved items">
      <FavoritesView />
    </Page>
  );
}
