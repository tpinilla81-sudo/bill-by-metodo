import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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
    images: [{ url: "https://bill-by-metodo.vercel.app/bill-by-metodo-logo.png", width: 512, height: 512 }],
    type: "website",
    siteName: "BILL by Metodo",
  },
  twitter: {
    card: "summary",
    title: "BILL by Metodo - Gestión Empresarial",
    description: "Sistema de gestión empresarial multi-empresa. Registros, Clientes, Catálogo y Facturación.",
    images: ["https://bill-by-metodo.vercel.app/bill-by-metodo-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
