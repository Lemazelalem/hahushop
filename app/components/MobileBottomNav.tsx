"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Home, Play, Sparkles, Package } from "lucide-react";

const M_ACCENT = "#FF0255";

export default function MobileBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldHideNav = useMemo(() => {
    if (!pathname) return false;

    return (
      pathname.startsWith("/products/") ||
      pathname === "/checkout" ||
      pathname.startsWith("/checkout/") ||
      pathname === "/cart" ||
      pathname.startsWith("/cart/") ||
      pathname === "/login" ||
      pathname === "/signup"
    );
  }, [pathname]);

  function getActive(): "home" | "browse" | "specials" | "account" {
    if (!pathname) return "home";
    if (pathname === "/" || pathname === "/home") return "home";
    if (pathname.startsWith("/shop")) return "browse";
    if (
      pathname.startsWith("/specials") ||
      pathname.startsWith("/business") ||
      pathname.startsWith("/public-employee")
    ) {
      return "specials";
    }
    if (
      pathname.startsWith("/account") ||
      pathname.startsWith("/orders") ||
      pathname.startsWith("/my-orders")
    ) {
      return "account";
    }
    return "home";
  }

  const active = getActive();

  const items = [
    { id: "home", label: "Home", icon: Home, href: "/" },
    { id: "browse", label: "Browse", icon: Play, href: "/shop" },
    { id: "specials", label: "Specials", icon: Sparkles, href: "/specials" },
    { id: "account", label: "Orders", icon: Package, href: "/my-orders" },
  ] as const;

  if (shouldHideNav) return null;

  if (!mounted) {
    return (
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 h-[80px] bg-white border-t border-slate-200" />
    );
  }

  return (
    <nav
      className="md:hidden"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
        background: "rgba(255,255,255,0.98)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderTop: "1px solid rgba(226,232,240,0.8)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.05)",
      }}
    >
      {items.map((nav) => {
        const Icon = nav.icon;
        const on = nav.id === active;

        return (
          <button
            key={nav.id}
            aria-label={nav.label}
            aria-current={on ? "page" : undefined}
            onClick={() => router.push(nav.href)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              background: "none",
              border: "none",
              borderTop: on ? `2px solid ${M_ACCENT}` : "2px solid transparent",
              cursor: "pointer",
              padding: "8px 0 12px",
              flex: 1,
              height: "100%",
              minHeight: 64,
              transition: "all 0.2s ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <Icon
              size={24}
              color={on ? M_ACCENT : "#64748b"}
              strokeWidth={on ? 2.5 : 2}
              style={{
                transition: "transform 0.2s ease",
                transform: on ? "scale(1.1)" : "scale(1)",
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: on ? 700 : 500,
                color: on ? M_ACCENT : "#64748b",
                fontFamily: "inherit",
                transition: "all 0.2s ease",
              }}
            >
              {nav.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
