"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { Container, Stack } from "@/components/ui/layout";
import { useServerWake } from "@/lib/use-server-wake";

// Shown when a page fails to load, e.g. the API server is waking up on its free host.
// It checks the server and loads the page again by itself once the server answers.
// retry() fetches the page again; reset() would only re-render the old result.
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const state = useServerWake(retry);
  const waking = state === "waking";
  return (
    <main className="flex-1">
      <Container width="prose" className="section-y">
        <Stack gap={4} className="items-start">
          <h1 className="text-heading">
            {waking ? "Waking up the server…" : "We couldn't load this page"}
          </h1>
          <p role="status" className="text-body text-fg-muted">
            {waking
              ? "This demo runs on a free host that sleeps when no one is using it. It usually takes under a minute. The page will load by itself."
              : "The server isn't answering right now. Please try again in a minute."}
          </p>
          <div className="flex gap-2">
            <Button variant={waking ? "secondary" : "primary"} onClick={() => retry()}>
              Try again
            </Button>
            <ButtonLink href="/" variant="secondary">
              Homepage
            </ButtonLink>
          </div>
        </Stack>
      </Container>
    </main>
  );
}
