// app/layout.tsx

// React & Next.js
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

// Styles
import "./globals.css";

// Components
import { MiniCartProvider } from "./components/MiniCartProvider";
import Header from "./components/Header";
import MobileBottomNav from "./components/MobileBottomNav";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "HahuShop - Ethiopia's Smart Marketplace",
  description:
    "Premium shopping experience for public employees and everyone. Fast 24h delivery across Ethiopia.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HahuShop",
  },
  keywords: ["shopping", "ethiopia", "public employee", "marketplace", "fast delivery"],
  authors: [{ name: "HahuShop" }],
  openGraph: {
    title: "HahuShop - Ethiopia's Smart Marketplace",
    description: "Premium shopping with exclusive public employee benefits",
    type: "website",
    locale: "en_ET",
  },
  icons: {
    icon: [
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} scroll-smooth`} suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-slate-50 antialiased`}>
        {/* Ambient glassmorphism background */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-gradient-to-br from-lime-400 via-green-400 to-cyan-400 rounded-full blur-3xl opacity-10 animate-pulse" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-gradient-to-br from-orange-400 via-red-400 to-rose-500 rounded-full blur-3xl opacity-10 animate-pulse delay-1000" />
        </div>

        <MiniCartProvider>
          {/* Desktop Header - hidden on mobile */}
          <div className="hidden md:block">
            <Suspense fallback={null}>
              <Header />
            </Suspense>
          </div>
          
          <main className="relative">{children}</main>
          
          {/* Mobile Bottom Nav - hidden on desktop */}
          <div className="md:hidden">
            <MobileBottomNav />
          </div>
        </MiniCartProvider>
      </body>
    </html>
  );
}