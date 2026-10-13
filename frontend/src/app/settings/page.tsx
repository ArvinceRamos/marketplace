import type { Metadata } from "next";
import { Page } from "@/components/ui/layout";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Settings · Marketplace", robots: { index: false } };

export default function SettingsPage() {
  return (
    <Page title="Settings" width="prose">
      <SettingsView />
    </Page>
  );
}
