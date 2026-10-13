import type { Metadata } from "next";
import { Page } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/text-link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account · Marketplace" };

export default function RegisterPage() {
  return (
    <Page title="Create an account" width="narrow">
      <RegisterForm />
      <p className="text-small text-fg-muted">
        Already have an account? <TextLink href="/login">Log in</TextLink>
      </p>
    </Page>
  );
}
