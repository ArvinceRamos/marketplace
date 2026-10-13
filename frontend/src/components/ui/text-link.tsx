import Link from "next/link";
import type { ComponentProps } from "react";

/** Inline text link inside sentences. Uses the `link` utility from globals.css. */
export function TextLink({ className = "", ...rest }: ComponentProps<typeof Link>) {
  return <Link className={`link ${className}`} {...rest} />;
}
