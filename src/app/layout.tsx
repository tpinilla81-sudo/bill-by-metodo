import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { VersionChecker } from "@/components/version-checker";

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
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* iOS Safari meta tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="format-detection" content="telephone=no" />
        {/* Inline version-check script — runs BEFORE any JS chunk loads.
            This is critical: it's embedded directly in the HTML, so it
            always executes even when the browser has old JS chunks cached.
            If the server's BUILD_ID differs from the one in localStorage,
            we force a hard reload (bypassing cache) so the user always
            gets the latest version. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                var BUILD_KEY = 'bill-build-id';
                var current = localStorage.getItem(BUILD_KEY);
                fetch('/api/version?t=' + Date.now(), {cache:'no-store', headers:{'Cache-Control':'no-cache'}})
                  .then(function(r){return r.ok ? r.json() : null;})
                  .then(function(d){
                    if (!d || !d.buildId || d.buildId === 'unknown') return;
                    if (current && current !== d.buildId) {
                      // Server has a newer build than what's in localStorage.
                      // Force a hard reload bypassing cache.
                      localStorage.setItem(BUILD_KEY, d.buildId);
                      window.location.reload();
                    }
                  })
                  .catch(function(){});
              } catch(e){}
            })();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* Version checker — auto-reloads when a new build is deployed */}
        <VersionChecker />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
