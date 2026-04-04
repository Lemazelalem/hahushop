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
      <head>
        {/* iOS Splash / Launch Images — uses welcome-hero for all device sizes */}
        {/* iPhone 15 Pro Max, 16 Plus (430×932 @3x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone 15 Pro, 16 (393×852 @3x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone 14 Pro Max (430×932 @3x) — same as 15 Pro Max */}
        {/* iPhone 14 Pro (393×852 @3x) — same as 15 Pro */}
        {/* iPhone 14 Plus, 13 Pro Max, 12 Pro Max (428×926 @3x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone 14, 13, 13 Pro, 12, 12 Pro (390×844 @3x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone 13 mini, 12 mini (375×812 @3x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone 11 Pro Max, XS Max (414×896 @3x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone 11, XR (414×896 @2x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" />
        {/* iPhone 11 Pro, XS, X (375×812 @3x) — same as 13 mini */}
        {/* iPhone 8 Plus, 7 Plus (414×736 @3x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)" />
        {/* iPhone SE 3rd/2nd, 8, 7 (375×667 @2x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" />
        {/* iPad Pro 12.9" (1024×1366 @2x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" />
        {/* iPad Pro 11" (834×1194 @2x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)" />
        {/* iPad Air, iPad 10th gen (820×1180 @2x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2)" />
        {/* iPad mini 6th (744×1133 @2x) */}
        <link rel="apple-touch-startup-image" href="/images/welcome-hero.jpg" media="(device-width: 744px) and (device-height: 1133px) and (-webkit-device-pixel-ratio: 2)" />
      </head>
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