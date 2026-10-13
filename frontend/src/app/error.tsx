"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { Container, Stack } from "@/components/ui/layout";

// Shown when a page fails to load, e.g. the API server is waking up on its free host.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex-1">
      <Container width="prose" className="section-y">
        <Stack gap={4} className="items-start">
          <h1 className="text-heading">We couldn&apos;t load this page</h1>
          <p className="text-body text-fg-muted">
            The server may be starting up. This can take up to a minute. Please try again.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <ButtonLink href="/" variant="secondary">
              Homepage
            </ButtonLink>
          </div>
        </Stack>
      </Container>
    </main>
  );
}
