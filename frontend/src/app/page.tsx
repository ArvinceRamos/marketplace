import { Container, Stack } from "@/components/ui/layout";

// Phase 1 placeholder. The real homepage arrives in Phase 3.
export default function Home() {
  return (
    <main className="flex-1">
      <Container width="prose" className="section-y">
        <Stack gap={3}>
          <h1 className="text-heading lg:text-display">Marketplace</h1>
          <p className="text-body text-fg-muted">
            Buy and sell new and preloved items in the Philippines. This site is under
            construction.
          </p>
        </Stack>
      </Container>
    </main>
  );
}
