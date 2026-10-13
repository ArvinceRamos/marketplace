import type { Metadata } from "next";
import { Suspense } from "react";
import { Page } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/text-link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in · Marketplace" };

export default function LoginPage() {
  return (
    <Page title="Log in" width="narrow">
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="text-small text-fg-muted">
        New here? <TextLink href="/register">Create an account</TextLink>
      </p>
    </Page>
  );
}
