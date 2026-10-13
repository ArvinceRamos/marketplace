// Security headers for every page (used by next.config.ts).
// Static CSP without nonces (decision 2026-10-13): nonces would force every page to render
// per request and drop the prerendered shells. Next.js needs inline scripts for its static
// shells, so script-src keeps 'unsafe-inline'. React escapes all user text, and we never use
// dangerouslySetInnerHTML, so the CSP is a second line of defence (SECURITY_PLAN T12).

const origin = (url: string | undefined) => {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

export function contentSecurityPolicy({
  supabaseUrl,
  apiBaseUrl,
  dev,
}: {
  supabaseUrl?: string;
  apiBaseUrl?: string;
  dev: boolean;
}) {
  const supabase = origin(supabaseUrl);
  const api = origin(apiBaseUrl);
  const remote = [supabase, api].filter((o): o is string => o !== null);
  const allHttps = remote.length > 0 && remote.every((o) => o.startsWith("https:"));

  const directives = [
    "default-src 'self'",
    // React uses eval in development only, for better error stacks.
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Listing photos and avatars come from Supabase Storage; blob: is for photo previews on /sell.
    ["img-src 'self' blob: data:", supabase].filter(Boolean).join(" "),
    "font-src 'self'",
    // Browser calls: our API, and Supabase Auth.
    ["connect-src 'self'", ...remote].join(" "),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only when everything is on HTTPS; local http://127.0.0.1 services would break otherwise.
    ...(allHttps ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

export function securityHeaders(env: {
  supabaseUrl?: string;
  apiBaseUrl?: string;
  dev: boolean;
}) {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(env) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // Browsers ignore this over plain http, so it is safe locally.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  ];
}
