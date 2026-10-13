import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Pages that need a signed-in user. The API checks again; this is only for UX.
const PROTECTED = [
  "/profile",
  "/settings",
  "/sell",
  "/my-listings",
  "/favorites",
  "/following",
  "/inbox",
  "/checkout",
  "/pay",
  "/orders",
  "/wallet",
];
const GUEST_ONLY = ["/login", "/register"];

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(`${p}/`));

// Refreshes the Supabase session cookie and verifies the token (getClaims checks
// the signature against the project's public keys). Never trust getSession() here.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;

  if (!signedIn && matches(path, PROTECTED)) {
    return redirectWithCookies(request, response, "/login", path + request.nextUrl.search);
  }
  if (signedIn && matches(path, GUEST_ONLY)) {
    return redirectWithCookies(request, response, "/");
  }
  return response;
}

function redirectWithCookies(
  request: NextRequest,
  from: NextResponse,
  to: string,
  next?: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = to;
  url.search = next ? `?next=${encodeURIComponent(next)}` : "";
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c));
  from.headers.forEach((value, key) => {
    if (["cache-control", "expires", "pragma"].includes(key)) redirect.headers.set(key, value);
  });
  return redirect;
}

export const config = {
  // Skip static files and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
