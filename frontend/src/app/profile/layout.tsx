import type { ReactNode } from "react";
import { AccountSidebar } from "@/components/account-nav";
import { Container } from "@/components/ui/layout";

/** Profile pages: an account sidebar on desktop, one column on phones. */
export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1">
      <Container className="section-y grid gap-10 lg:grid-cols-[13.75rem_minmax(0,1fr)]">
        <AccountSidebar />
        <div className="min-w-0">{children}</div>
      </Container>
    </main>
  );
}
