import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `) || d === name);

describe("contentSecurityPolicy", () => {
  const local = {
    supabaseUrl: "http://127.0.0.1:54421",
    apiBaseUrl: "http://localhost:8000/api",
    dev: false,
  };

  it("allows only our own origins for scripts, data calls, and images", () => {
    const csp = contentSecurityPolicy(local);
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(directive(csp, "connect-src")).toBe(
      "connect-src 'self' http://127.0.0.1:54421 http://localhost:8000",
    );
    expect(directive(csp, "img-src")).toBe("img-src 'self' blob: data: http://127.0.0.1:54421");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
  });

  it("adds unsafe-eval only in development", () => {
    expect(directive(contentSecurityPolicy({ ...local, dev: true }), "script-src")).toContain(
      "'unsafe-eval'",
    );
    expect(contentSecurityPolicy(local)).not.toContain("unsafe-eval");
  });

  it("upgrades insecure requests only when every service is on https", () => {
    expect(contentSecurityPolicy(local)).not.toContain("upgrade-insecure-requests");
    const hosted = contentSecurityPolicy({
      supabaseUrl: "https://abc.supabase.co",
      apiBaseUrl: "https://api.example.com",
      dev: false,
    });
    expect(hosted).toContain("upgrade-insecure-requests");
  });

  it("ignores missing or broken URLs instead of allowing everything", () => {
    const csp = contentSecurityPolicy({ supabaseUrl: "not a url", dev: false });
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(csp).not.toContain("*");
  });
});

describe("securityHeaders", () => {
  it("denies framing and MIME sniffing", () => {
    const headers = Object.fromEntries(
      securityHeaders({ dev: false }).map((h) => [h.key, h.value]),
    );
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Content-Security-Policy"]).toBeTruthy();
  });
});
