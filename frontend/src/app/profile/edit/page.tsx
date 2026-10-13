import type { Metadata } from "next";
import { ProfileEditForm } from "./profile-edit-form";

export const metadata: Metadata = { title: "Edit profile · Marketplace", robots: { index: false } };

export default function ProfileEditPage() {
  return <ProfileEditForm />;
}
