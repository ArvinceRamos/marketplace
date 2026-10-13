import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Container, Stack } from "@/components/ui/layout";
import { AdminTabs } from "./admin-tabs";

export const metadata: Metadata = { title: "Moderation · Marketplace", robots: { index: false } };

/** Moderator area. The route guard needs a session; the API needs the admin role. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1">
      <Container className="section-y">
        <Stack gap={6}>
          <h1 className="text-heading lg:text-display">Moderation</h1>
          <AdminTabs />
          {children}
        </Stack>
      </Container>
    </main>
  );
}
