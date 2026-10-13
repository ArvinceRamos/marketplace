import type { Metadata } from "next";
import { Page } from "@/components/ui/layout";
import { ProfileView } from "./profile-view";

export const metadata: Metadata = { title: "Your profile · Marketplace", robots: { index: false } };

export default function ProfilePage() {
  return (
    <Page title="Your profile" width="prose">
      <ProfileView />
    </Page>
  );
}
