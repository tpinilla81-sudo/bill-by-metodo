import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { VersionChecker } from "@/components/version-checker";
import { readFileSync } from "fs";
import { join } from "path";

// Force dynamic rendering — never serve a prerendered/cached HTML.
// This ensures every request gets a fresh HTML with the latest inline
// version-check script and references to the latest JS chunks.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Reads the current BUILD_ID from .next/BUILD_ID.
 * Called on every render (force-dynamic) so it's always the latest build.
 */
function getBuildId(): string {
  try {
    return readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf-8').trim()
  } catch {
    return 'unknown'
  }
}

export const metadata: Metadata = {
  title: "BILL by Metodo - Gestión Empresarial",
  description: "Sistema de gestión empresarial multi-empresa. Registros, Clientes, Catálogo y Facturación.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "BILL by Metodo - Gestión Empresarial",
    description: "Sistema de gestión empresarial multi-empresa. Registros, Clientes, Catálogo y Facturación.",
    images: [{ url: "https://bill-by-metodo.vercel.app/og-image.png", width: 1200, height: 630 }],
    type: "website",
    siteName: "BILL by Metodo",
  },
  twitter: {
    card: "summary_large_image",
    title: "BILL by Metodo - Gestión Empresarial",
    description: "Sistema de gestión empresarial multi-empresa. Registros, Clientes, Catálogo y Facturación.",
    images: ["https://bill-by-metodo.vercel.app/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const buildId = getBuildId()

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* iOS Safari meta tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="format-detection" content="telephone=no" />
        {/* Anti-cache meta tags — belt and suspenders alongside HTTP headers */}
        <meta httpEquiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />

        {/* 1) Stamp the current BUILD_ID into the page itself.
            This is the version the HTML was rendered with. The inline
            check script below compares this against /api/version and,
            if different, redirects to a NEW URL (?v=NEW_BUILD_ID) which
            forces the browser to fetch fresh HTML (different URL = cache miss). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__BUILD_ID__ = ${JSON.stringify(buildId)};`,
          }}
        />

        {/* 2) Inline version-check script — runs BEFORE any JS chunk loads.
            This is critical: it's embedded directly in the HTML, so it
            always executes even when the browser has old JS chunks cached.
            If the server's BUILD_ID differs from the one stamped in this
            page, we redirect to ?v=NEW_BUILD_ID which forces a fresh fetch. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                var current = window.__BUILD_ID__;
                if (!current || current === 'unknown') return;

                // Cache-busting query — never use a cached response
                var url = '/api/version?t=' + Date.now();
                fetch(url, {cache:'no-store', headers:{'Cache-Control':'no-cache','Pragma':'no-cache'}})
                  .then(function(r){return r.ok ? r.json() : null;})
                  .then(function(d){
                    if (!d || !d.buildId || d.buildId === 'unknown') return;
                    if (current !== d.buildId) {
                      // Build changed! Redirect to a NEW URL with ?v=NEW_BUILD_ID
                      // Different URL = browser MUST fetch fresh HTML = fresh JS chunks
                      var newUrl = window.location.pathname
                        + '?v=' + encodeURIComponent(d.buildId)
                        + '&t=' + Date.now();
                      if (window.location.hash) newUrl += window.location.hash;
                      // use replace() so we don't pollute browser history
                      window.location.replace(newUrl);
                    }
                  })
                  .catch(function(){});
              } catch(e){}
            })();`,
          }}
        />

        {/* 3) After the page finishes loading, strip ?v= from the URL
            to keep URLs clean for sharing/bookmarking. The inline check
            script has already run by then so the version check still works. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                if (window.location.search.indexOf('v=') !== -1) {
                  window.addEventListener('load', function(){
                    setTimeout(function(){
                      var clean = window.location.pathname + window.location.hash;
                      window.history.replaceState(null, '', clean);
                    }, 500);
                  });
                }
              } catch(e){}
            })();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* Version checker — polls /api/version and shows a visible banner
            if a new build is detected and the silent redirect didn't fire */}
        <VersionChecker />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
