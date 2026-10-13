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
