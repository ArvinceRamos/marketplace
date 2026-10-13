import type { Metadata } from "next";
import { Page } from "@/components/ui/layout";
import { FollowingView } from "./following-view";

export const metadata: Metadata = { title: "Following · Marketplace", robots: { index: false } };

export default function FollowingPage() {
  return (
    <Page title="Following">
      <FollowingView />
    </Page>
  );
}
