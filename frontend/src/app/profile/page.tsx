import type { Metadata } from "next";
import { ProfileView } from "./profile-view";

export const metadata: Metadata = { title: "Your profile · Marketplace", robots: { index: false } };

export default function ProfilePage() {
  return <ProfileView />;
}
