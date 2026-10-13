# Marketplace — profile & listing pages (design bundle for Claude Design)

## Brief
- **Product:** PH peer-to-peer classifieds / thrift marketplace (Carousell-like, original design). Next.js 16 App Router + React 19 + Tailwind v4 (`@theme` tokens in `globals.css`). Checkout is a test-mode demo.
- **Audience:** mobile-first Filipino buyers and sellers; photos carry the color, UI stays quiet.
- **Keep:** one accent color (deep indigo), cool neutral grays, Inter, 4 px grid, 44 px touch targets, 16 px input text, 6 px / 12 px radii, hairline borders, light theme only, role-based tokens (no raw hex in components), WCAG AA contrast, visible focus ring.
- **Pages in scope:** listing detail (`/listing/[id]`), public seller profile (`/seller/[username]`), own profile (`/profile`, `/profile/edit`).

## Goals (current UX problems)
**Listing page**
1. Buy / Chat buttons appear late (empty 44 px placeholder while a client fetch runs). Show guest CTAs immediately.
2. Desktop gallery stacks all photos (up to 8) in a 2-col grid; no lightbox, zoom, or thumbnail strip. Mobile swipe row has no "1 / 8" indicator.
3. Seller card lacks rating / review count — the main trust signal at decision time.
4. On mobile, the description sits below the action panel, specs, seller card and safety text.
5. Page dead-ends: no "More from this seller", similar items, or share.
6. Owner sees only Edit / My listings; no quick Pause / Mark sold.
7. Safety notice is a dense paragraph; make it one line + link to /safety, or collapsible.

**Seller page**
1. Reviews are far below a paginated grid; consider Listings | Reviews tabs or a rating summary in the header.
2. No at-a-glance stats strip (items sold, rating, followers, joined).

**Own profile**
1. No avatar upload control and no city field (both missing today; design them in).
2. `/profile` is a bare data list unlike the public seller page. Suggest: public view + owner toolbar, "View public profile", shortcuts to Orders, Wallet, Favorites, Settings.

## Data available
See `lib/catalog-types.ts` (`ListingDetail`, `PublicProfile`, `ListingCard`) and `lib/profile.ts` (`Me`). Public profile already has `rating_average`, `rating_count`, `follower_count`, `active_listing_count`, `restricted`.

## Source files

### `docs/DESIGN_SYSTEM.md`

~~~markdown
# Design System

Last updated: 2026-10-13. Source of truth: `frontend/src/app/globals.css` (Tailwind v4 `@theme`).

## Where the principles came from
On 2026-10-13 we studied the public Vinted web app (catalog and app pages), reading computed styles
only. We kept the *principles* and used our own values, font, color, and names. No Vinted text,
assets, logo, or brand color is used.

| Observed principle | Our rule |
|---|---|
| Photos carry the color; UI is quiet | One accent color (deep indigo), everything else cool neutral grays |
| Compact type, light body weight, medium labels | 6-step scale, Inter: 400 body, 500 labels/buttons, 600 headings |
| 4px spacing grid (2–128px) | Tailwind `--spacing` = 4px; use steps 1, 2, 3, 4, 5, 6, 8, 10, 12, 16 |
| 1px hairline borders, few shadows | `border-border` for dividers, `border-border-strong` for inputs; shadows only for overlays |
| Small radii: 6px controls, 12px sheets, pills | `rounded-sm` 6px, `rounded-md` 12px, `rounded-full` |
| Buttons: filled / outlined / flat, 32–44px | `primary` / `secondary` / `ghost` / `danger`; `sm` 36px, `md` 44px (default), `lg` 48px |
| Underlined accent links | `link` utility / `<TextLink>` |
| Borderless product cards, portrait photo, 12px meta text | `media-frame` (4:5, rounded, tinted placeholder) + `text-caption` details |
| 2-col grid on phones growing to 5 on desktop; ~1280px container | `product-grid` (2 / 3 / 4 / 5 columns), `container-page` (1280px, 16→20px gutters) |
| Compact header | Sticky 56px header with a hairline bottom border |

## Tokens (use semantic names in components)
- **Text:** `text-caption` 12/16 · `text-small` 14/20 · `text-body` 16/24 · `text-title` 18/24 ·
  `text-heading` 22/28 · `text-display` 28/36. Page titles: `text-heading lg:text-display`.
- **Color roles:** `bg-canvas`, `bg-surface`, `bg-surface-muted`, `text-fg`, `text-fg-muted`,
  `text-fg-subtle` (icons/disabled only, 3.1:1), `placeholder:text-fg-placeholder` (4.8:1), `bg-accent`, `hover:bg-accent-hover`, `bg-accent-soft`,
  `text-danger` / `bg-danger-soft`, `text-success`, `bg-warning` (with `text-fg`).
- **Raw scales** (`brand-50…900`, `ink-50…950`) only when no role fits.
- **Contrast:** `text-fg` and `text-fg-muted` pass WCAG AA on white; `bg-accent` with white text is 7:1.

## Primitives
| Name | Where | Use |
|---|---|---|
| `container-page` / `-prose` / `-narrow` | CSS utilities | Page width 1280 / 640 / 384px with side gutters |
| `section-y` | CSS utility | Vertical page padding (24px → 40px) |
| `product-grid` | CSS utility | Listing grids |
| `media-frame` | CSS utility | Any product photo (fixed ratio, no layout shift) |
| `scroll-row` | CSS utility | Horizontal chip/category rows on mobile |
| `link` | CSS utility | Inline text links |
| `<Container>`, `<Stack>`, `<Cluster>`, `<Page>` | `components/ui/layout.tsx` | Layout without repeating classes |
| `<Button>`, `<ButtonLink>`, `buttonClasses()` | `components/ui/button.tsx` | Actions vs navigation, same look |
| `<TextLink>` | `components/ui/text-link.tsx` | Links inside sentences |
| `<TextField>`, `<TextArea>`, `<FormAlert>` | `components/ui/field.tsx` | 44px inputs, 16px text, errors linked by `aria-describedby` |

## Rules
1. One filled (primary) button per screen area; everything else secondary or ghost.
2. Touch targets at least 44px tall on mobile (`md` buttons, inputs, checkbox rows).
3. Inputs use 16px text so iOS does not zoom.
4. Focus: one global 2px accent outline on `:focus-visible`; never remove it.
5. No hardcoded hex colors or Tailwind palette colors (`teal-*`, `gray-*`) in components.
6. Motion is short (150ms) and disabled under `prefers-reduced-motion`.
7. Light theme only for now; dark mode is a later addition (tokens are role-based to make it easy).

~~~

### `frontend/src/app/globals.css`

~~~css
@import "tailwindcss";

/*
 * Marketplace design system. Rules are summarised in docs/DESIGN_SYSTEM.md.
 * Principles (studied from calm, product-first marketplaces; nothing copied):
 * - Photos carry the color. UI stays quiet: one accent, cool neutral grays.
 * - Compact type scale, regular body weight, medium labels, semibold headings.
 * - 4px spacing grid. Hairline borders instead of shadows. Small, consistent radii.
 * Light theme only for now (dark mode tokens can be added later).
 */

@theme {
  /* ---------- Typography ---------- */
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
    Arial, sans-serif;

  /* Each size has a fixed line height so text blocks align to the 4px grid. */
  --text-caption: 0.75rem; /* 12px: meta, timestamps, card details */
  --text-caption--line-height: 1rem;
  --text-small: 0.875rem; /* 14px: secondary text, buttons, labels */
  --text-small--line-height: 1.25rem;
  --text-body: 1rem; /* 16px: default reading size, form inputs (no iOS zoom) */
  --text-body--line-height: 1.5rem;
  --text-title: 1.125rem; /* 18px: card/section titles, prices on detail page */
  --text-title--line-height: 1.5rem;
  --text-heading: 1.375rem; /* 22px: page headings on mobile */
  --text-heading--line-height: 1.75rem;
  --text-display: 1.75rem; /* 28px: page headings on desktop, hero */
  --text-display--line-height: 2.25rem;

  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* ---------- Color: brand (deep indigo, our own) ---------- */
  --color-brand-50: #eef0ff;
  --color-brand-100: #e0e3ff;
  --color-brand-200: #c4c9ff;
  --color-brand-300: #a0a6fb;
  --color-brand-400: #7c80f2;
  --color-brand-500: #5b5ce6;
  --color-brand-600: #4643d4; /* primary actions; 7:1 on white */
  --color-brand-700: #3a35b0; /* hover / pressed */
  --color-brand-800: #2f2b8a;
  --color-brand-900: #25236b;

  /* ---------- Color: ink (cool neutral grays) ---------- */
  --color-ink-950: #14171a; /* primary text */
  --color-ink-700: #4b5359; /* secondary text; 7.6:1 on white */
  --color-ink-600: #6b737a; /* placeholder text; 4.8:1 on white */
  --color-ink-500: #8a9298; /* icons, disabled text (not for body copy) */
  --color-ink-300: #c5cacd; /* strong borders, input outlines */
  --color-ink-200: #dfe3e5; /* hairline dividers */
  --color-ink-100: #eef1f2; /* subtle fills, hover, image placeholders */
  --color-ink-50: #f6f8f8; /* page sections, skeletons */

  /* ---------- Color: semantic roles (use these in components) ---------- */
  --color-canvas: #ffffff; /* page background */
  --color-surface: #ffffff; /* cards, sheets, header */
  --color-surface-muted: var(--color-ink-50);
  --color-fg: var(--color-ink-950);
  --color-fg-muted: var(--color-ink-700);
  --color-fg-subtle: var(--color-ink-500);
  --color-fg-placeholder: var(--color-ink-600);
  --color-fg-on-brand: #ffffff;
  --color-border: var(--color-ink-200);
  --color-border-strong: var(--color-ink-300);
  --color-accent: var(--color-brand-600);
  --color-accent-hover: var(--color-brand-700);
  --color-accent-soft: var(--color-brand-50);
  --color-focus: var(--color-brand-500);

  --color-danger: #c2334a; /* 5.8:1 on white */
  --color-danger-soft: #fdeef0;
  --color-success: #23794f; /* 5.4:1 on white */
  --color-success-soft: #e9f8ef;
  --color-warning: #f5b83d; /* fills only; put ink-950 text on it */
  --color-warning-soft: #fff6e5;

  /* ---------- Shape ---------- */
  --radius-sm: 0.375rem; /* 6px: buttons, inputs, photos, chips */
  --radius-md: 0.75rem; /* 12px: cards, dialogs, sheets */
  --radius-full: 9999px; /* pills, avatars */

  /* Shadows only for things that float above the page (menus, dialogs). */
  --shadow-raised: 0 1px 2px rgb(20 23 26 / 0.12);
  --shadow-overlay: 0 4px 16px rgb(20 23 26 / 0.16);

  /* ---------- Layout ---------- */
  --container-page: 80rem; /* 1280px content width */
  --container-prose: 40rem; /* 640px forms and reading */
  --container-narrow: 24rem; /* 384px auth forms */

  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
}

/* ---------- Base element styles ---------- */
@layer base {
  :root {
    color-scheme: light;
    --header-height: 3.5rem; /* 56px */
  }

  html {
    -webkit-text-size-adjust: 100%;
    text-rendering: optimizeLegibility;
  }

  body {
    background: var(--color-canvas);
    color: var(--color-fg);
    font-family: var(--font-sans);
    font-size: var(--text-body);
    line-height: var(--text-body--line-height);
    -webkit-font-smoothing: antialiased;
  }

  h1,
  h2,
  h3 {
    font-weight: var(--font-weight-semibold);
    color: var(--color-fg);
    text-wrap: balance;
  }

  p {
    text-wrap: pretty;
  }

  /* Prices and counts line up in lists. */
  [data-numeric] {
    font-variant-numeric: tabular-nums;
  }

  ::selection {
    background: var(--color-brand-100);
    color: var(--color-fg);
  }

  /* One visible focus style everywhere (keyboard only). */
  :focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
}

/* ---------- Reusable responsive primitives ---------- */

/* Page container: 1280px max, 16px side gutter on phones, 20px from tablet up. */
@utility container-page {
  width: 100%;
  max-width: var(--container-page);
  margin-inline: auto;
  padding-inline: calc(var(--spacing) * 4);
  @media (width >= 48rem) {
    padding-inline: calc(var(--spacing) * 5);
  }
}

/* Narrower containers for forms and reading; same gutters. */
@utility container-prose {
  width: 100%;
  max-width: calc(var(--container-prose) + var(--spacing) * 8);
  margin-inline: auto;
  padding-inline: calc(var(--spacing) * 4);
}

@utility container-narrow {
  width: 100%;
  max-width: calc(var(--container-narrow) + var(--spacing) * 8);
  margin-inline: auto;
  padding-inline: calc(var(--spacing) * 4);
}

/* Vertical page rhythm: 24px top/bottom on phones, 40px on desktop. */
@utility section-y {
  padding-block: calc(var(--spacing) * 6);
  @media (width >= 64rem) {
    padding-block: calc(var(--spacing) * 10);
  }
}

/* Product grid: 2 columns on phones, 3 on tablets, 4 on laptops, 5 on wide screens.
   Tight column gap, more row gap so each card's text reads as its own unit. */
@utility product-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: calc(var(--spacing) * 2);
  row-gap: calc(var(--spacing) * 6);
  @media (width >= 40rem) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    column-gap: calc(var(--spacing) * 3);
  }
  @media (width >= 64rem) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    column-gap: calc(var(--spacing) * 4);
  }
  @media (width >= 80rem) {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
}

/* Product photo frame: fixed 4:5 portrait ratio, rounded, tinted while loading. */
@utility media-frame {
  position: relative;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--color-ink-100);
  & > img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

/* Inline text link: accent color, underline that thickens on hover. */
@utility link {
  color: var(--color-accent);
  font-weight: var(--font-weight-medium);
  text-decoration-line: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  &:hover {
    color: var(--color-accent-hover);
    text-decoration-thickness: 2px;
  }
}

/* Hide scrollbars on horizontal chip rows while keeping them scrollable. */
@utility scroll-row {
  display: flex;
  gap: calc(var(--spacing) * 2);
  overflow-x: auto;
  scrollbar-width: none;
  scroll-snap-type: x proximity;
  &::-webkit-scrollbar {
    display: none;
  }
  & > * {
    flex: none;
    scroll-snap-align: start;
  }
}

~~~

### `frontend/src/app/layout.tsx`

~~~tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

// Inter (SIL Open Font License), self-hosted by next/font at build time.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Marketplace",
  description: "Buy and sell new and preloved items in the Philippines.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#content"
          className="sr-only z-30 rounded-sm bg-surface px-4 py-3 text-small font-medium text-accent shadow-lg focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <Providers>
          <SiteHeader />
          {/* Skip-link target. Pages render their own <main> inside. At least one screen tall,
              so the footer starts below the fold and does not jump when data loads. */}
          <div id="content" tabIndex={-1} className="flex min-h-dvh flex-1 flex-col outline-none">
            {children}
          </div>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}

~~~

### `frontend/src/components/site-header.tsx`

~~~tsx
import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
import { SearchBox } from "@/components/catalog/search-box";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
      <div className="container-page flex h-(--header-height) items-center gap-2 sm:gap-4">
        <Link href="/" className="shrink-0 rounded-sm text-title font-semibold tracking-tight text-accent">
          Marketplace
        </Link>
        <div className="hidden flex-1 md:block md:max-w-xl">
          <SearchBox id="site-search-desktop" />
        </div>
        <div className="ml-auto">
          <AuthNav />
        </div>
      </div>
      {/* Phones: search gets its own row under the logo. */}
      <div className="container-page pb-3 md:hidden">
        <SearchBox id="site-search-mobile" />
      </div>
    </header>
  );
}

~~~

### `frontend/src/components/ui/layout.tsx`

~~~tsx
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

~~~

### `frontend/src/components/ui/button.tsx`

~~~tsx
import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type StyleProps = { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean };

const base =
  "inline-flex items-center justify-center gap-2 rounded-sm font-medium whitespace-nowrap " +
  "transition-colors duration-150 ease-standard select-none " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

// Filled = the one main action on a screen. Secondary = outlined. Ghost = low emphasis.
const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-fg-on-brand hover:bg-accent-hover",
  secondary: "border border-border-strong bg-surface text-fg hover:bg-ink-100",
  ghost: "text-fg-muted hover:bg-ink-100 hover:text-fg",
  danger: "bg-danger text-white hover:brightness-95",
};

// md is 44px: the minimum comfortable touch target. sm only for dense desktop rows.
const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-small",
  md: "min-h-11 px-4 text-small",
  lg: "min-h-12 px-5 text-body",
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth = false,
}: StyleProps = {}) {
  return `${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & StyleProps;

export function Button({
  variant,
  size,
  fullWidth,
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonClasses({ variant, size, fullWidth })} ${className}`}
      {...rest}
    />
  );
}

/** A link that looks like a button (navigation, not an action). */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  className = "",
  ...rest
}: ComponentProps<typeof Link> & StyleProps) {
  return (
    <Link className={`${buttonClasses({ variant, size, fullWidth })} ${className}`} {...rest} />
  );
}

~~~

### `frontend/src/components/ui/text-link.tsx`

~~~tsx
import Link from "next/link";
import type { ComponentProps } from "react";

/** Inline text link inside sentences. Uses the `link` utility from globals.css. */
export function TextLink({ className = "", ...rest }: ComponentProps<typeof Link>) {
  return <Link className={`link ${className}`} {...rest} />;
}

~~~

### `frontend/src/components/ui/field.tsx`

~~~tsx
import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type Base = { label: string; name: string; error?: string; hint?: string };

// 44px tall, 16px text (prevents iOS zoom), strong border that turns accent on focus.
const inputClass =
  "w-full rounded-sm border border-border-strong bg-surface px-4 py-2.5 text-body text-fg " +
  "placeholder:text-fg-placeholder hover:border-ink-500 " +
  "focus-visible:border-accent focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-accent " +
  "aria-[invalid=true]:border-danger disabled:bg-ink-100 disabled:text-fg-subtle";

function Messages({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  return (
    <>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-caption text-fg-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-caption text-danger">
          {error}
        </p>
      )}
    </>
  );
}

function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

const labelClass = "text-small font-medium text-fg";

export function TextField({
  label,
  name,
  error,
  hint,
  ...rest
}: Base & InputHTMLAttributes<HTMLInputElement>) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${inputClass} min-h-11`}
        {...rest}
      />
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}

export function TextArea({
  label,
  name,
  error,
  hint,
  ...rest
}: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${inputClass} min-h-28`}
        {...rest}
      />
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  children,
  ...rest
}: Base & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = `field-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${inputClass} min-h-11`}
        {...rest}
      >
        {children}
      </select>
      <Messages id={id} error={error} hint={hint} />
    </div>
  );
}

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-sm border border-danger/30 bg-danger-soft px-3 py-2 text-small text-danger"
    >
      {message}
    </p>
  );
}

~~~

### `frontend/src/components/catalog/avatar.tsx`

~~~tsx
import Image from "next/image";

/** Round avatar; falls back to the first letter of the name. */
export function Avatar({
  name,
  url,
  size = 40,
}: {
  name: string;
  url: string | null;
  size?: 40 | 64;
}) {
  const box = size === 64 ? "size-16 text-heading" : "size-10 text-small";
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-100 font-semibold text-brand-800 ${box}`}
      aria-hidden
    >
      {url ? <Image src={url} alt="" fill sizes={`${size}px`} /> : name.charAt(0).toUpperCase()}
    </span>
  );
}

~~~

### `frontend/src/components/catalog/listing-card.tsx`

~~~tsx
import Image from "next/image";
import Link from "next/link";
import { FavoriteButton } from "@/components/favorite-button";
import type { ListingCard as Card } from "@/lib/catalog-types";
import { sizeLabel } from "@/lib/deal-options";
import { CONDITION_LABELS, formatPrice } from "@/lib/format";

const STATUS_BADGE: Partial<Record<Card["status"], string>> = {
  sold: "Sold",
  paused: "Paused",
  reserved: "Reserved",
};

/** Borderless product card: photo first, then price, title, and quiet details. */
export function ListingCard({ listing, priority = false }: { listing: Card; priority?: boolean }) {
  const badge = STATUS_BADGE[listing.status];
  return (
    <article className="group relative flex flex-col gap-2">
      <div className="media-frame">
        {listing.cover_thumb_url ? (
          <Image
            src={listing.cover_thumb_url}
            alt=""
            fill
            sizes="(min-width: 80rem) 20vw, (min-width: 64rem) 25vw, (min-width: 40rem) 33vw, 50vw"
            priority={priority}
            className="transition-transform duration-300 ease-standard group-hover:scale-[1.02]"
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-caption text-fg-muted">
            No photo
          </span>
        )}
        <FavoriteButton listingId={listing.id} title={listing.title} />
        {badge && (
          <span className="absolute top-2 left-2 rounded-full bg-ink-950/80 px-2 py-0.5 text-caption font-medium text-white">
            {badge}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <p className="text-body font-semibold text-fg" data-numeric>
          {formatPrice(listing.price_centavos)}
        </p>
        <h3 className="line-clamp-2 text-small font-regular text-fg">
          {/* The whole card is clickable through this link's stretched area. */}
          <Link
            href={`/listing/${listing.id}`}
            className="after:absolute after:inset-0 after:rounded-sm focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
          >
            {listing.title}
          </Link>
        </h3>
        <p className="text-caption text-fg-muted">
          {[listing.size && sizeLabel(listing.size), CONDITION_LABELS[listing.condition], listing.city.name]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </article>
  );
}

~~~

### `frontend/src/components/catalog/listing-grid.tsx`

~~~tsx
import type { ReactNode } from "react";
import type { ListingCard as Card } from "@/lib/catalog-types";
import { ListingCard } from "./listing-card";

export function ListingGrid({ listings, empty }: { listings: Card[]; empty?: ReactNode }) {
  if (listings.length === 0) return <>{empty}</>;
  return (
    <ul className="product-grid" role="list">
      {listings.map((listing, i) => (
        <li key={listing.id}>
          <ListingCard listing={listing} priority={i < 4} />
        </li>
      ))}
    </ul>
  );
}

export function ListingGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <ul className="product-grid" aria-busy="true" aria-label="Loading listings">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex flex-col gap-2">
          <div className="media-frame animate-pulse" />
          <div className="h-5 w-1/3 animate-pulse rounded-sm bg-ink-100" />
          <div className="h-4 w-4/5 animate-pulse rounded-sm bg-ink-100" />
        </li>
      ))}
    </ul>
  );
}

~~~

### `frontend/src/components/catalog/empty-state.tsx`

~~~tsx
import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border-strong px-6 py-12 text-center">
      <h2 className="text-title">{title}</h2>
      {body && <p className="max-w-md text-small text-fg-muted">{body}</p>}
      {action}
    </div>
  );
}

~~~

### `frontend/src/components/catalog/pagination.tsx`

~~~tsx
import { ButtonLink } from "@/components/ui/button";

/** Previous / next links that keep the current filters. */
export function Pagination({
  page,
  hasNext,
  total,
  pageSize,
  hrefFor,
}: {
  page: number;
  hasNext: boolean;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
}) {
  const pages = Math.max(1, Math.min(50, Math.ceil(total / pageSize)));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 border-t border-border pt-6">
      {page > 1 ? (
        <ButtonLink href={hrefFor(page - 1)} variant="secondary" rel="prev">
          Previous
        </ButtonLink>
      ) : (
        <span />
      )}
      <p className="text-small text-fg-muted" data-numeric>
        Page {page} of {pages}
      </p>
      {hasNext && page < 50 ? (
        <ButtonLink href={hrefFor(page + 1)} variant="secondary" rel="next">
          Next
        </ButtonLink>
      ) : (
        <span />
      )}
    </nav>
  );
}

~~~

### `frontend/src/components/orders/stars.tsx`

~~~tsx
/** Read-only star rating, e.g. ★★★★☆ with a text label for screen readers. */
export function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-small text-fg" role="img" aria-label={`${rating} out of 5 stars`}>
      <span aria-hidden className="tracking-wide text-[#b7791f]">
        {"★".repeat(rating)}
        <span className="text-ink-300">{"★".repeat(5 - rating)}</span>
      </span>
    </span>
  );
}

~~~

### `frontend/src/app/listing/[id]/page.tsx`

~~~tsx
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/catalog/avatar";
import { ListingViewerPanel } from "@/components/listing-viewer-panel";
import { Container, Stack } from "@/components/ui/layout";
import { TextLink } from "@/components/ui/text-link";
import { getListingOr404 } from "@/lib/catalog";
import type { ListingDetail } from "@/lib/catalog-types";
import { COURIER_LABELS, PAYMENT_LABELS } from "@/lib/deal-options";
import { CONDITION_HINTS, CONDITION_LABELS, formatDate, formatPrice } from "@/lib/format";

type Props = PageProps<"/listing/[id]">;

export default function ListingPage(props: Props) {
  return (
    <main className="flex-1">
      <Container className="section-y">
        <Suspense fallback={<DetailSkeleton />}>
          <ListingContent params={props.params} />
        </Suspense>
      </Container>
    </main>
  );
}

async function ListingContent({ params }: Pick<Props, "params">) {
  const { id } = await params;
  const listing = await getListingOr404(id);
  const deal = [listing.meetup && "Meetup", listing.delivery && "Delivery"].filter(Boolean);
  return (
    <Stack gap={6}>
      <Breadcrumbs listing={listing} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-10">
        <Gallery listing={listing} />
        <div className="flex flex-col gap-6 lg:sticky lg:top-[calc(var(--header-height)+1.5rem)] lg:self-start">
          <StatusBanner status={listing.status} />
          <Stack gap={2}>
            <p className="text-heading font-semibold lg:text-display" data-numeric>
              {formatPrice(listing.price_centavos)}
            </p>
            <h1 className="text-title font-regular text-fg">{listing.title}</h1>
            <p className="text-small text-fg-muted">
              {listing.city.name}
              {listing.published_at && <> · Listed {formatDate(listing.published_at)}</>}
            </p>
          </Stack>

          <ListingViewerPanel listingId={listing.id} title={listing.title} status={listing.status} />

          <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-3 border-y border-border py-4 text-small">
            <dt className="text-fg-muted">Condition</dt>
            <dd>
              <span className="font-medium">{CONDITION_LABELS[listing.condition]}</span>
              <span className="block text-caption text-fg-muted">
                {CONDITION_HINTS[listing.condition]}
              </span>
            </dd>
            {listing.size && (
              <>
                <dt className="text-fg-muted">Size</dt>
                <dd className="font-medium">{listing.size}</dd>
              </>
            )}
            <dt className="text-fg-muted">Category</dt>
            <dd>
              <TextLink href={`/categories/${listing.category.slug}`}>
                {listing.category.name}
              </TextLink>
            </dd>
            <dt className="text-fg-muted">Deal</dt>
            <dd>
              {deal.join(" or ")}
              {listing.deal_note && (
                <span className="block text-caption text-fg-muted">{listing.deal_note}</span>
              )}
            </dd>
            {listing.payment_methods.length > 0 && (
              <>
                <dt className="text-fg-muted">Payment</dt>
                <dd>{listing.payment_methods.map((m) => PAYMENT_LABELS[m]).join(", ")}</dd>
              </>
            )}
            {listing.couriers.length > 0 && (
              <>
                <dt className="text-fg-muted">Ships via</dt>
                <dd>{listing.couriers.map((c) => COURIER_LABELS[c]).join(", ")}</dd>
              </>
            )}
          </dl>

          <SellerCard listing={listing} />

          <p className="rounded-md bg-surface-muted p-4 text-caption text-fg-muted">
            Checkout on this site is a test-mode demo: no real money moves. Real payments and
            delivery are arranged between you and the seller. Meet in a public place, check the
            item before paying, and never send money in advance to someone you have not met.
          </p>
        </div>
      </div>

      <section aria-labelledby="desc-heading" className="flex max-w-3xl flex-col gap-2">
        <h2 id="desc-heading" className="text-title">
          Description
        </h2>
        <p className="text-body whitespace-pre-line text-fg">
          {listing.description || "The seller did not add a description."}
        </p>
      </section>
    </Stack>
  );
}

function Breadcrumbs({ listing }: { listing: ListingDetail }) {
  const crumbs = [listing.parent_category, listing.category].filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-caption text-fg-muted">
        <li>
          <Link href="/" className="hover:text-fg hover:underline">
            Home
          </Link>
        </li>
        {crumbs.map((c) => (
          <li key={c.slug} className="flex items-center gap-1">
            <span aria-hidden>/</span>
            <Link href={`/categories/${c.slug}`} className="hover:text-fg hover:underline">
              {c.name}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Swipeable photo row on phones; a grid on desktop (first photo large). */
function Gallery({ listing }: { listing: ListingDetail }) {
  if (listing.images.length === 0) {
    return (
      <div className="media-frame grid place-items-center text-small text-fg-muted">No photos</div>
    );
  }
  return (
    <ul
      aria-label={`${listing.images.length} photos`}
      className="scroll-row -mx-4 px-4 lg:mx-0 lg:grid lg:grid-cols-2 lg:overflow-visible lg:px-0"
    >
      {listing.images.map((img, i) => (
        <li
          key={img.id}
          className={`${listing.images.length > 1 ? "w-[85%]" : "w-full"} lg:w-auto ${i === 0 ? "lg:col-span-2" : ""}`}
        >
          <div className="media-frame">
            <Image
              src={img.full_url}
              alt={i === 0 ? listing.title : `${listing.title}, photo ${i + 1}`}
              fill
              priority={i === 0}
              sizes="(min-width: 64rem) 50vw, 85vw"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusBanner({ status }: { status: ListingDetail["status"] }) {
  if (status === "active") return null;
  const text =
    status === "sold"
      ? "This item has been sold."
      : status === "reserved"
        ? "This item is reserved for a buyer's order."
        : status === "paused"
        ? "The seller has paused this listing for now."
        : "This listing is not published.";
  return (
    <p role="status" className="rounded-sm bg-warning-soft px-3 py-2 text-small text-fg">
      {text}
    </p>
  );
}

function SellerCard({ listing }: { listing: ListingDetail }) {
  const { seller } = listing;
  const name = seller.display_name ?? seller.username;
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} url={seller.avatar_url} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-small font-medium text-fg">{name}</span>
        <span className="text-caption text-fg-muted">@{seller.username}</span>
      </div>
      <TextLink href={`/seller/${seller.username}`} className="ml-auto text-small">
        View profile
      </TextLink>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:gap-10" aria-busy="true">
      <div className="media-frame animate-pulse" />
      <div className="flex flex-col gap-3">
        <div className="h-9 w-40 animate-pulse rounded-sm bg-ink-100" />
        <div className="h-6 w-3/4 animate-pulse rounded-sm bg-ink-100" />
        <div className="h-32 w-full animate-pulse rounded-md bg-ink-100" />
      </div>
    </div>
  );
}

~~~

### `frontend/src/components/listing-viewer-panel.tsx`

~~~tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FavoriteButton } from "@/components/favorite-button";
import { useSession } from "@/components/providers";
import { ReportDialog } from "@/components/safety/report-dialog";
import { Button, ButtonLink } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import type { ListingDetail } from "@/lib/catalog-types";

/**
 * The listing page is rendered for everyone without a token, so the server can't
 * know who is looking. Signed-in visitors ask the API (which checks the token):
 * owners get Edit; others get Save and Chat.
 */
export function ListingViewerPanel({
  listingId,
  title,
  status,
}: {
  listingId: string;
  title: string;
  status: ListingDetail["status"];
}) {
  const session = useSession();
  const router = useRouter();
  const [viewer, setViewer] = useState<Pick<
    ListingDetail,
    "is_owner" | "my_conversation_id" | "my_open_order_id"
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    if (session !== "user") return;
    let active = true;
    apiFetch<ListingDetail>(`/listings/${listingId}`)
      .then((d) => active && setViewer(d))
      .catch(() => active && setViewer(null));
    return () => {
      active = false;
    };
  }, [session, listingId]);

  if (session === "loading" || (session === "user" && !viewer)) {
    return <div className="h-11" aria-hidden />;
  }

  if (viewer?.is_owner) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-accent-soft p-3">
        <p className="text-small font-medium">This is your listing.</p>
        <div className="flex gap-2">
          <ButtonLink href={`/my-listings/${listingId}/edit`} size="sm">
            Edit
          </ButtonLink>
          <ButtonLink href="/my-listings" size="sm" variant="secondary">
            My listings
          </ButtonLink>
        </div>
      </div>
    );
  }

  async function openChat() {
    if (session === "guest") {
      router.push(`/login?next=${encodeURIComponent(`/listing/${listingId}`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { id } = await apiFetch<{ id: string }>(`/listings/${listingId}/conversations`, {
        method: "POST",
      });
      router.push(`/inbox/${id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open the chat. Try again.");
      setBusy(false);
    }
  }

  function openReport() {
    if (session === "guest") {
      router.push(`/login?next=${encodeURIComponent(`/listing/${listingId}`)}`);
      return;
    }
    setReporting(true);
  }

  const existingChat = viewer?.my_conversation_id;
  const openOrder = viewer?.my_open_order_id;
  return (
    <div className="flex flex-col gap-2">
      {openOrder ? (
        <ButtonLink href={`/orders/${openOrder}`}>View your order</ButtonLink>
      ) : (
        status === "active" && (
          // Guests are sent to log in by the route guard, then come back here.
          <ButtonLink href={`/checkout/${listingId}`} size="lg">
            Buy
          </ButtonLink>
        )
      )}
      <div className="grid grid-cols-[1fr_auto] gap-2">
        {existingChat ? (
          <ButtonLink href={`/inbox/${existingChat}`}>Open chat</ButtonLink>
        ) : status === "active" ? (
          <Button onClick={openChat} disabled={busy} variant="secondary">
            {busy ? "Opening…" : "Chat with seller"}
          </Button>
        ) : (
          <span />
        )}
        <FavoriteButton listingId={listingId} title={title} variant="full" />
      </div>
      {status === "active" && !existingChat && (
        <p className="text-caption text-fg-muted">
          Buy with test-mode checkout, or ask questions and make an offer in the chat.
        </p>
      )}
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={openReport}
        className="self-end rounded-sm px-1 text-caption text-fg-muted underline-offset-2 hover:text-fg hover:underline"
      >
        Report this listing
      </button>
      <ReportDialog
        open={reporting}
        target={{ type: "listing", listingId, label: title }}
        onClose={() => setReporting(false)}
      />
    </div>
  );
}

~~~

### `frontend/src/components/favorite-button.tsx`

~~~tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useFavorites, useSession } from "@/components/providers";
import { ApiError } from "@/lib/api";

/**
 * Heart toggle. Guests are sent to log in and come back here.
 * `overlay` sits on a card photo; `full` is a labelled button on the listing page.
 */
export function FavoriteButton({
  listingId,
  title,
  variant = "overlay",
}: {
  listingId: string;
  title: string;
  variant?: "overlay" | "full";
}) {
  const session = useSession();
  const { ids, toggle } = useFavorites();
  const router = useRouter();
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const saved = ids?.has(listingId) ?? false;

  async function onClick() {
    if (session === "guest") {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setError(null);
    try {
      await toggle(listingId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save. Try again.");
    }
  }

  const heart = (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill={saved ? "currentColor" : "none"}>
      <path
        d="M12 20.5s-7.5-4.6-9.2-9.3C1.6 7.8 3.9 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.7 1.1-1.6 2.7-2.7 4.7-2.7 3.4 0 5.7 3.3 4.5 6.7-1.7 4.7-9.2 9.3-9.2 9.3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (variant === "overlay") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={session === "loading"}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
        title={error ?? undefined}
        // z-10: above the card's full-size link.
        className={`absolute top-2 right-2 z-10 grid size-9 place-items-center rounded-full bg-surface/90 shadow-sm hover:bg-surface ${
          saved ? "text-danger" : "text-fg"
        }`}
      >
        {heart}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={session === "loading"}
        aria-pressed={saved}
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-border-strong bg-surface px-4 text-small font-medium hover:bg-ink-100 ${
          saved ? "text-danger" : "text-fg"
        }`}
      >
        {heart}
        {saved ? "Saved" : "Save"}
      </button>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

~~~

### `frontend/src/app/seller/[username]/page.tsx`

~~~tsx
import { Suspense } from "react";
import { Avatar } from "@/components/catalog/avatar";
import { EmptyState } from "@/components/catalog/empty-state";
import { ListingGrid, ListingGridSkeleton } from "@/components/catalog/listing-grid";
import { FollowButton } from "@/components/follow-button";
import { Stars } from "@/components/orders/stars";
import { UserSafetyMenu } from "@/components/safety/user-safety-menu";
import { Pagination } from "@/components/catalog/pagination";
import { Container, Stack } from "@/components/ui/layout";
import { getProfileOr404, getSellerListings, getSellerReviews } from "@/lib/catalog";
import { formatDate } from "@/lib/format";
import { ratingLine } from "@/lib/orders";
import { personName } from "@/lib/social";

type Props = PageProps<"/seller/[username]">;

export default function SellerPage(props: Props) {
  return (
    <main className="flex-1">
      <Container className="section-y">
        <Suspense fallback={<ListingGridSkeleton />}>
          <SellerContent params={props.params} searchParams={props.searchParams} />
        </Suspense>
      </Container>
    </main>
  );
}

async function SellerContent({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ username }, raw] = await Promise.all([params, searchParams]);
  const pageParam = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  const page = Math.min(50, Math.max(1, Number(pageParam) || 1));
  const [profile, listings, reviews] = await Promise.all([
    getProfileOr404(username),
    getSellerListings(username, page),
    getSellerReviews(username),
  ]);
  const name = profile.display_name ?? profile.username;
  const details = [profile.city?.name, `Joined ${formatDate(profile.joined_at)}`].filter(Boolean);

  return (
    <Stack gap={8}>
      <section className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="absolute top-0 right-0">
          <UserSafetyMenu username={profile.username} name={name} />
        </div>
        <Avatar name={name} url={profile.avatar_url} size={64} />
        <Stack gap={2}>
          <div className="pr-14">
            <h1 className="text-heading">{name}</h1>
            <p className="text-small text-fg-muted">@{profile.username}</p>
          </div>
          <p className="text-small text-fg-muted">{details.join(" · ")}</p>
          {profile.restricted && (
            <p role="status" className="rounded-sm bg-warning-soft px-3 py-2 text-small">
              A moderator restricted this account. Be careful dealing with it.
            </p>
          )}
          <p className="text-small font-medium">
            <a href="#seller-reviews" className="hover:underline">
              {ratingLine(profile.rating_average, profile.rating_count)}
            </a>
          </p>
          {profile.bio && <p className="max-w-2xl text-body">{profile.bio}</p>}
          <FollowButton username={profile.username} followers={profile.follower_count} />
        </Stack>
      </section>
      <section aria-labelledby="seller-listings" className="flex flex-col gap-4">
        <h2 id="seller-listings" className="text-title">
          Listings{" "}
          <span className="font-regular text-fg-muted" data-numeric>
            ({profile.active_listing_count})
          </span>
        </h2>
        <ListingGrid
          listings={listings.items}
          empty={<EmptyState title="No active listings" body="Check back later." />}
        />
        <Pagination
          page={listings.page}
          hasNext={listings.has_next}
          total={listings.total}
          pageSize={listings.page_size}
          hrefFor={(p) => `/seller/${profile.username}${p > 1 ? `?page=${p}` : ""}`}
        />
      </section>
      <section aria-labelledby="seller-reviews" className="flex flex-col gap-4">
        <h2 id="seller-reviews" className="text-title">
          Reviews{" "}
          <span className="font-regular text-fg-muted" data-numeric>
            ({reviews.count})
          </span>
        </h2>
        {reviews.items.length === 0 ? (
          <p className="text-small text-fg-muted">
            No reviews yet. Reviews come only from completed orders.
          </p>
        ) : (
          <ul className="flex max-w-2xl flex-col divide-y divide-border">
            {reviews.items.map((r, i) => (
              <li key={i} className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Stars rating={r.rating} />
                  <span className="text-caption text-fg-muted">
                    {personName(r.reviewer)} · {r.reviewer_role === "buyer" ? "bought" : "sold"}{" "}
                    {r.title} · {formatDate(r.created_at)}
                  </span>
                </div>
                {r.comment && <p className="text-small">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Stack>
  );
}

~~~

### `frontend/src/components/follow-button.tsx`

~~~tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api";
import { followPath, followerText } from "@/lib/follows";
import type { Me } from "@/lib/profile";

/**
 * Follow/Following toggle plus the follower count. Hidden on your own profile.
 * Guests see the count and are sent to log in when they press Follow.
 */
export function FollowButton({ username, followers }: { username: string; followers: number }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  // null = not known yet; "self" = the viewer's own profile.
  const [following, setFollowing] = useState<boolean | "self" | null>(null);
  // Our own follow/unfollow, added to the server count.
  const [delta, setDelta] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session !== "user") return;
    let active = true;
    Promise.all([apiFetch<Me>("/me"), apiFetch<{ following: boolean }>(followPath(username))])
      .then(([me, state]) => {
        if (active) setFollowing(me.username === username ? "self" : state.following);
      })
      .catch(() => active && setFollowing(false));
    return () => {
      active = false;
    };
  }, [session, username]);

  const countText = <span className="text-small text-fg-muted">{followerText(Math.max(0, followers + delta))}</span>;
  if (following === "self") return countText;

  async function toggle() {
    if (session === "guest") {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    const next = !following;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(followPath(username), { method: next ? "PUT" : "DELETE" });
      setFollowing(next);
      setDelta((d) => d + (next ? 1 : -1));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={following ? "secondary" : "primary"}
          aria-pressed={session === "user" ? following === true : undefined}
          disabled={busy || session === "loading" || (session === "user" && following === null)}
          onClick={toggle}
        >
          {following ? "Following" : "Follow"}
        </Button>
        {countText}
      </div>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

~~~

### `frontend/src/components/safety/user-safety-menu.tsx`

~~~tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/components/providers";
import { ReportDialog } from "@/components/safety/report-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MoreMenu, moreMenuItem } from "@/components/ui/more-menu";
import { ApiError, apiFetch } from "@/lib/api";
import type { Me } from "@/lib/profile";
import { INBOX_CHANGED, type BlockedUser } from "@/lib/safety";

type Props = {
  username: string;
  /** Display name for dialogs. */
  name: string;
  /** Known block state (the chat has it). Left out: asked from the API. */
  blocked?: boolean;
  onChange?: (blocked: boolean) => void;
};

/**
 * "•••" menu with Report user and Block/Unblock user. Hidden on your own profile.
 * Guests are sent to log in first.
 */
export function UserSafetyMenu({ username, name, blocked: known, onChange }: Props) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  // null = loading; "self" = this is the viewer's own profile.
  const [loaded, setLoaded] = useState<{ blocked: boolean } | "self" | null>(null);
  const [dialog, setDialog] = useState<"report" | "block" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session !== "user" || known !== undefined) return;
    let active = true;
    Promise.all([apiFetch<Me>("/me"), apiFetch<BlockedUser[]>("/me/blocks")])
      .then(([me, blocks]) => {
        if (!active) return;
        if (me.username === username) setLoaded("self");
        else setLoaded({ blocked: blocks.some((b) => b.username === username) });
      })
      .catch(() => active && setLoaded({ blocked: false }));
    return () => {
      active = false;
    };
  }, [session, known, username]);

  if (session === "loading" || loaded === "self") return null;
  if (session === "user" && known === undefined && loaded === null) return null;
  const blocked = known ?? loaded?.blocked ?? false;

  function choose(action: "report" | "block") {
    if (session === "guest") {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setError(null);
    setDialog(action);
  }

  async function setBlocked(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/users/${encodeURIComponent(username)}/block`, {
        method: next ? "PUT" : "DELETE",
      });
      setLoaded({ blocked: next });
      setDialog(null);
      window.dispatchEvent(new Event(INBOX_CHANGED));
      onChange?.(next);
    } catch (e) {
      setDialog(null);
      setError(e instanceof ApiError ? e.message : "Could not update. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <MoreMenu label={`More actions for @${username}`}>
        <button type="button" data-menu-item className={moreMenuItem} onClick={() => choose("report")}>
          Report user
        </button>
        {blocked ? (
          <button
            type="button"
            data-menu-item
            className={moreMenuItem}
            disabled={busy}
            onClick={() => void setBlocked(false)}
          >
            Unblock user
          </button>
        ) : (
          <button
            type="button"
            data-menu-item
            className={`${moreMenuItem} text-danger`}
            onClick={() => choose("block")}
          >
            Block user
          </button>
        )}
      </MoreMenu>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      <ReportDialog
        open={dialog === "report"}
        target={{ type: "user", username, label: `${name} (@${username})` }}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "block"}
        title={`Block ${name}?`}
        body="They won't be able to message you or send offers, and you won't be able to message them. Your chats with them will be hidden from your inbox. You can unblock them anytime in Settings."
        action="Block"
        variant="danger"
        pending={busy}
        onConfirm={() => void setBlocked(true)}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

~~~

### `frontend/src/app/profile/page.tsx`

~~~tsx
import type { Metadata } from "next";
import { Page } from "@/components/ui/layout";
import { ProfileView } from "./profile-view";

export const metadata: Metadata = { title: "Your profile · Marketplace", robots: { index: false } };

export default function ProfilePage() {
  return (
    <Page title="Your profile" width="prose">
      <ProfileView />
    </Page>
  );
}

~~~

### `frontend/src/app/profile/profile-view.tsx`

~~~tsx
"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { ButtonLink } from "@/components/ui/button";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import type { Me } from "@/lib/profile";

export function ProfileView() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    apiFetch<Me>("/me")
      .then((data) => active && setMe(data))
      .catch((e: unknown) => active && setError(e instanceof ApiError ? e.message : "Could not load your profile."));
    return () => {
      active = false;
    };
  }, [attempt]);

  // Pages stay mounted (hidden) after navigation. Drop account data when hidden,
  // so it isn't kept around after logging out on a shared device.
  useLayoutEffect(
    () => () => {
      setMe(null);
      setError(null);
    },
    [],
  );

  if (error) {
    return (
      <LoadError
        message={error}
        onRetry={() => {
          setError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  if (!me) {
    return (
      <div aria-busy="true" aria-label="Loading profile" className="flex flex-col gap-3">
        <div className="h-6 w-40 animate-pulse rounded-sm bg-ink-100" />
        <div className="h-4 w-64 animate-pulse rounded-sm bg-ink-100" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-y-1 text-small sm:grid-cols-[8rem_1fr] sm:gap-x-4 sm:gap-y-3">
        <dt className="text-fg-muted">Username</dt>
        <dd className="mb-2 font-medium sm:mb-0">@{me.username}</dd>
        <dt className="text-fg-muted">Display name</dt>
        <dd className="mb-2 sm:mb-0">{me.display_name ?? <span className="text-fg-muted">Not set</span>}</dd>
        <dt className="text-fg-muted">Email</dt>
        <dd className="mb-2 sm:mb-0">{me.email}</dd>
        <dt className="text-fg-muted">Bio</dt>
        <dd className="mb-2 whitespace-pre-line sm:mb-0">
          {me.bio || <span className="text-fg-muted">Not set</span>}
        </dd>
        <dt className="text-fg-muted">Joined</dt>
        <dd className="mb-2 sm:mb-0">{new Date(me.created_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/profile/edit">Edit profile</ButtonLink>
        <ButtonLink href="/my-listings" variant="secondary">
          My listings
        </ButtonLink>
        <SignOutButton variant="secondary" />
      </div>
    </div>
  );
}

~~~

### `frontend/src/app/profile/edit/profile-edit-form.tsx`

~~~tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert, TextArea, TextField } from "@/components/ui/field";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import type { Me } from "@/lib/profile";

type FieldName = "username" | "display_name" | "bio";
type Fields = Partial<Record<FieldName, string>>;

// Friendly text per field; the API's validation wording is for developers.
const FIELD_MESSAGES: Record<FieldName, string> = {
  username: "Use 3–30 lowercase letters, numbers, dots, or underscores.",
  display_name: "Use 1–50 characters.",
  bio: "Use up to 500 characters.",
};

function friendlyFields(apiFields: Record<string, string>): Fields {
  const out: Fields = {};
  for (const name of Object.keys(FIELD_MESSAGES) as FieldName[]) {
    if (apiFields[name]) out[name] = FIELD_MESSAGES[name];
  }
  return out;
}

export function ProfileEditForm() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [fields, setFields] = useState<Fields>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Runs again when this page becomes visible after navigating away.
  useEffect(() => {
    let active = true;
    apiFetch<Me>("/me")
      .then((data) => active && setMe(data))
      .catch((e: unknown) => active && setAlert(e instanceof ApiError ? e.message : "Could not load your profile."));
    return () => {
      active = false;
    };
  }, [attempt]);

  // Pages stay mounted (hidden) after navigation. Reset when hidden, so account data
  // isn't kept after logging out and a finished save doesn't leave "Saving…" behind.
  useLayoutEffect(
    () => () => {
      setMe(null);
      setFields({});
      setAlert(null);
      setPending(false);
    },
    [],
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("display_name") ?? "").trim();
    setPending(true);
    setFields({});
    setAlert(null);
    try {
      await apiFetch<Me>("/me", {
        method: "PATCH",
        body: JSON.stringify({
          username: String(form.get("username") ?? ""),
          display_name: displayName || null,
          bio: String(form.get("bio") ?? ""),
        }),
      });
      router.push("/profile");
    } catch (e) {
      if (e instanceof ApiError && e.code === "username_taken") {
        setFields({ username: e.message });
      } else if (e instanceof ApiError && e.fields) {
        setFields(friendlyFields(e.fields));
        setAlert("Please fix the highlighted fields.");
      } else {
        setAlert(e instanceof ApiError ? e.message : "Could not save. Please try again.");
      }
      setPending(false);
    }
  }

  if (!me) {
    if (!alert) return <p aria-busy="true">Loading…</p>;
    return (
      <LoadError
        message={alert}
        onRetry={() => {
          setAlert(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <FormAlert message={alert} />
      <TextField
        label="Username"
        name="username"
        defaultValue={me.username}
        autoComplete="username"
        hint="3–30 characters: lowercase letters, numbers, dots, underscores."
        error={fields.username}
        required
      />
      <TextField
        label="Display name"
        name="display_name"
        defaultValue={me.display_name ?? ""}
        maxLength={50}
        error={fields.display_name}
      />
      <TextArea
        label="Bio"
        name="bio"
        defaultValue={me.bio ?? ""}
        maxLength={500}
        hint="Up to 500 characters. Don't share your phone number or address."
        error={fields.bio}
      />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" onClick={() => router.push("/profile")}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

~~~

### `frontend/src/lib/catalog-types.ts`

~~~ts
// Shapes returned by the FastAPI browse endpoints (docs/API_SPECIFICATION.md).

export const CONDITIONS = [
  "brand_new",
  "like_new",
  "lightly_used",
  "well_used",
  "heavily_used",
] as const;
export type Condition = (typeof CONDITIONS)[number];

// Deal options are labels only: payments and couriers are arranged outside the app.
export const PAYMENT_METHODS = ["gcash", "maya", "bank_transfer", "cash", "cod"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const COURIERS = ["jnt", "flash", "lbc", "lalamove", "grab"] as const;
export type Courier = (typeof COURIERS)[number];

export const SORTS = ["newest", "price_asc", "price_desc", "relevance"] as const;
export type Sort = (typeof SORTS)[number];

export type CategoryRef = { id: number; slug: string; name: string };
/** A subcategory, with its size list (empty when the category has no sizes). */
export type CategoryChild = CategoryRef & { sizes: string[] };
export type CategoryNode = CategoryRef & { children: CategoryChild[] };
export type Location = { id: number; slug: string; city: string; province: string; region: string };
export type CityRef = { id: number; slug: string; name: string };

export type ListingCard = {
  id: string;
  title: string;
  price_centavos: number;
  condition: Condition;
  status: "draft" | "active" | "paused" | "sold" | "reserved";
  city: CityRef;
  cover_thumb_url: string | null;
  seller: { username: string; display_name: string | null; avatar_url: string | null };
  published_at: string | null;
  size: string | null;
};

export type ListingImage = {
  id: string;
  position: number;
  full_url: string;
  thumb_url: string;
  width: number;
  height: number;
};

export type ListingDetail = ListingCard & {
  description: string;
  category: CategoryRef;
  parent_category: CategoryRef | null;
  images: ListingImage[];
  meetup: boolean;
  delivery: boolean;
  deal_note: string | null;
  payment_methods: PaymentMethod[];
  couriers: Courier[];
  created_at: string;
  updated_at: string;
  is_owner: boolean;
  // Only meaningful for a signed-in viewer.
  is_favorited: boolean;
  my_open_order_id?: string | null;
  /** Hidden by a moderator; only the owner still sees it. */
  hidden?: boolean;
  my_conversation_id: string | null;
};

export type ListingPage = {
  items: ListingCard[];
  page: number;
  page_size: number;
  total: number;
  has_next: boolean;
};

export type PublicProfile = {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  city: CityRef | null;
  joined_at: string;
  active_listing_count: number;
  follower_count: number;
  /** Average of public reviews (1 decimal), null when there are none. */
  rating_average: number | null;
  rating_count: number;
  /** A moderator restricted this account. */
  restricted: boolean;
};

~~~

### `frontend/src/lib/profile.ts`

~~~ts
export type Me = {
  id: string;
  email: string | null;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_path: string | null;
  city_id: number | null;
  age_confirmed: boolean;
  created_at: string;
  /** Restricted by a moderator: can only finish open orders. */
  restricted: boolean;
  /** From the signed token; for showing the Admin link only (the API checks again). */
  is_admin: boolean;
};

~~~
