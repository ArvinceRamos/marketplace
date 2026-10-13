import { EmptyState } from "@/components/catalog/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";

export default function NotFound() {
  return (
    <main className="flex-1">
      <Container width="prose" className="section-y">
        <EmptyState
          title="This page isn't available"
          body="The item may have been removed, or the link is wrong."
          action={<ButtonLink href="/">Go to the homepage</ButtonLink>}
        />
      </Container>
    </main>
  );
}
