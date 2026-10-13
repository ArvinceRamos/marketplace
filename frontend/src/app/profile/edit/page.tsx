import type { Metadata } from "next";
import { Page } from "@/components/ui/layout";
import { ProfileEditForm } from "./profile-edit-form";

export const metadata: Metadata = { title: "Edit profile · Marketplace" };

export default function ProfileEditPage() {
  return (
    <Page title="Edit profile" width="prose">
      <ProfileEditForm />
    </Page>
  );
}
