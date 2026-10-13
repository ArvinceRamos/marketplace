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
