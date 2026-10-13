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
