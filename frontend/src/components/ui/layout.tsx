import type { ElementType, HTMLAttributes, ReactNode } from "react";

type Width = "page" | "prose" | "narrow";

const widths: Record<Width, string> = {
  page: "container-page",
  prose: "container-prose",
  narrow: "container-narrow",
};

/** Centered content column with responsive side gutters (see globals.css). */
export function Container({
  width = "page",
  as: Tag = "div",
  className = "",
  ...rest
}: HTMLAttributes<HTMLElement> & { width?: Width; as?: ElementType }) {
  return <Tag className={`${widths[width]} ${className}`} {...rest} />;
}

// Gaps follow the 4px grid: 2=8px, 3=12px, 4=16px, 6=24px, 8=32px.
const gaps = { 2: "gap-2", 3: "gap-3", 4: "gap-4", 6: "gap-6", 8: "gap-8" } as const;
type Gap = keyof typeof gaps;

/** Vertical stack with consistent spacing between children. */
export function Stack({
  gap = 4,
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement> & { gap?: Gap }) {
  return <div className={`flex flex-col ${gaps[gap]} ${className}`} {...rest} />;
}

/** Horizontal row that wraps on small screens (buttons, chips, meta info). */
export function Cluster({
  gap = 2,
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement> & { gap?: Gap }) {
  return <div className={`flex flex-wrap items-center ${gaps[gap]} ${className}`} {...rest} />;
}

/** Standard page shell: container + vertical rhythm + a heading. */
export function Page({
  title,
  width = "page",
  children,
}: {
  title: string;
  width?: Width;
  children: ReactNode;
}) {
  return (
    <main className="flex-1">
      <Container width={width} className="section-y">
        <Stack gap={6}>
          <h1 className="text-heading lg:text-display">{title}</h1>
          {children}
        </Stack>
      </Container>
    </main>
  );
}
