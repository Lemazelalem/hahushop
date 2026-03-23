"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMiniCart } from "@/components/MiniCartProvider";
import { useState, useEffect, useMemo } from "react";
import { Menu, X, ShoppingCart, BadgeCheck } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const BASE_NAV_ITEMS = [
  { href: "/shop", label: "Shop" },
  { href: "/categories", label: "Categories" },
  { href: "/contact", label: "Contact" },
];

type ProfileRow = {
  id: string;
  role: "admin" | "seller" | "customer" | null;
  is_public_employee: boolean | null;
  pe_verification_status: "pending" | "approved" | "rejected" | null;
};

export default function Navbar() {
  const pathname = usePathname();
  const { itemCount: count } = useMiniCart();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [authLoaded, setAuthLoaded] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  // ───────────────────────── Auth + Profile (no RoleContext) ──────────────────────
  useEffect(() => {
    let alive = true;

    async function loadAuthAndProfile() {
      try {
        setAuthLoaded(false);

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!alive) return;

        if (userError || !user) {
          setProfile(null);
          setAuthLoaded(true);
          return;
        }

        const { data: prof, error: profError } = await supabase
          .from("profiles")
          .select("id, role, is_public_employee, pe_verification_status")
          .eq("id", user.id)
          .maybeSingle();

        if (!alive) return;

        if (profError) {
          console.error("Navbar profile error:", profError);
          setProfile(null);
        } else {
          setProfile(prof as ProfileRow);
        }

        setAuthLoaded(true);
      } catch (err) {
        if (!alive) return;
        console.error("Navbar auth/profile error:", err);
        setProfile(null);
        setAuthLoaded(true);
      }
    }

    loadAuthAndProfile();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadAuthAndProfile();
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  const isAdmin = profile?.role === "admin";
  const isSeller = profile?.role === "seller";
  const isCustomer = profile?.role === "customer";
  const isGuest = authLoaded && !profile;

  const isVerifiedPE =
    !!profile?.is_public_employee && profile?.pe_verification_status === "approved";
  const isPendingPE =
    !!profile?.is_public_employee && profile?.pe_verification_status === "pending";

  // Scroll shadow effect
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Role-based nav items
  const navItems = useMemo(() => {
    const items = [...BASE_NAV_ITEMS];
    if (isCustomer) {
      items.push({ href: "/my-orders", label: "My Orders" });
    }
    if (isAdmin) {
      items.push({ href: "/admin", label: "Admin" });
    }
    if (isSeller) {
      items.push({ href: "/seller", label: "Seller" });
    }
    return items;
  }, [isAdmin, isSeller, isCustomer]);

  const roleLabel = useMemo(() => {
    if (!authLoaded) return "Loading…";
    if (isAdmin) return "Admin";
    if (isSeller) return "Seller";
    if (isCustomer) return "Customer";
    return "Guest";
  }, [authLoaded, isAdmin, isSeller, isCustomer]);

  // Don't render full navbar until auth is loaded (to avoid flicker)
  if (!authLoaded) {
    return (
      <header className="sticky top-3 z-50 px-4">
        <div className="mx-auto max-w-7xl rounded-[28px] bg-slate-950/80 backdrop-blur-2xl border border-white/10 h-16 flex items-center justify-center">
          <div className="animate-pulse text-white text-sm">Loading...</div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-3 z-50 px-4">
      <div
        className={`mx-auto max-w-7xl rounded-[28px] border border-white/10 bg-slate-950/80 backdrop-blur-2xl transition-all duration-500 ${
          isScrolled
            ? "shadow-2xl shadow-slate-950/50 border-white/20"
            : "shadow-xl shadow-slate-950/20"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-3.5">
          {/* LEFT: Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-white via-slate-100 to-slate-200 flex items-center justify-center shadow-lg shadow-white/10 group-hover:shadow-xl group-hover:shadow-emerald-400/30 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 ease-out">
              <span className="text-2xl">🛍️</span>
            </div>
            <div className="leading-tight hidden sm:block">
              <div className="flex items-baseline gap-0.5">
                <span className="text-white font-bold text-xl tracking-tight">
                  Shop
                </span>
                <span className="text-emerald-400 font-bold text-xl tracking-tight">
                  Ease
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">
                Curated for you
              </div>
            </div>
          </Link>

          {/* CENTER: Nav - Desktop */}
          <nav className="hidden lg:flex items-center">
            <div className="flex items-center bg-slate-900/50 rounded-full p-1 border border-white/5">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-300 ${
                      active
                        ? "text-slate-900"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {active && (
                      <span className="absolute inset-0 bg-white rounded-full shadow-lg shadow-white/20" />
                    )}
                    <span className="relative z-10">{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Public Employee - ONLY for customers */}
            {isCustomer && (
              <Link
                href="/public-employee"
                className="ml-4 relative inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 px-5 py-3 text-sm font-bold text-slate-900 shadow-lg shadow-orange-500/30 overflow-hidden group hover:shadow-2xl hover:shadow-orange-500/50 hover:scale-105 hover:-translate-y-0.5 active:scale-95 transition-all duration-300"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />

                <span className="text-xl relative z-10 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-300">
                  🎖️
                </span>
                <span className="relative z-10">Public Employee</span>

                {isVerifiedPE && (
                  <BadgeCheck className="w-4 h-4 relative z-10 text-slate-900" />
                )}
                {isPendingPE && (
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse relative z-10" />
                )}
              </Link>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2.5 text-white hover:bg-white/10 rounded-xl transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>

          {/* RIGHT: Role + Cart - Desktop */}
          <div className="hidden lg:flex items-center gap-4">
            {/* Role pill */}
            <div
              className={`flex items-center gap-2.5 rounded-full bg-slate-900/60 border border-white/10 px-4 py-2.5 text-sm font-medium transition-all duration-300 cursor-default ${
                isAdmin
                  ? "text-red-400 border-red-400/50"
                  : isSeller
                  ? "text-lime-400 border-lime-400/50"
                  : isCustomer
                  ? "text-emerald-400 border-emerald-400/50"
                  : "text-slate-400"
              }`}
            >
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-pulse ${
                    isAdmin
                      ? "bg-red-400"
                      : isSeller
                      ? "bg-lime-400"
                      : "bg-emerald-400"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    isAdmin
                      ? "bg-red-500"
                      : isSeller
                      ? "bg-lime-500"
                      : "bg-emerald-500"
                  }`}
                />
              </span>
              <span>{roleLabel}</span>
            </div>

            {/* Cart - Only for customers/guests */}
            {(isCustomer || isGuest) && (
              <Link
                href="/checkout"
                className="relative flex items-center gap-2.5 rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-900 border-2 border-transparent hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-400/20 hover:scale-105 active:scale-95 transition-all duration-300 group overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <ShoppingCart className="w-5 h-5 relative z-10 group-hover:scale-110 transition-transform" />
                <span className="relative z-10">Cart</span>
                {count > 0 ? (
                  <span className="relative z-10 rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-bold text-white min-w-[1.5rem] text-center group-hover:bg-emerald-500 transition-colors">
                    {count > 99 ? "99+" : count}
                  </span>
                ) : (
                  <span className="relative z-10 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-400 group-hover:bg-slate-200 transition-colors">
                    0
                  </span>
                )}
              </Link>
            )}

            {/* Admin/Seller quick links */}
            {isAdmin && (
              <Link
                href="/admin"
                className="px-4 py-2 rounded-full bg-red-500/20 text-red-400 text-sm font-bold border border-red-500/30 hover:bg-red-500/30 transition-colors"
              >
                Admin
              </Link>
            )}
            {isSeller && (
              <Link
                href="/seller"
                className="px-4 py-2 rounded-full bg-lime-500/20 text-lime-400 text-sm font-bold border border-lime-500/30 hover:bg-lime-500/30 transition-colors"
              >
                Seller
              </Link>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-white/10 px-5 pb-5">
            <nav className="flex flex-col gap-2 pt-4">
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`px-5 py-3.5 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? "bg-white text-slate-900 shadow-lg"
                        : "text-slate-300 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}

              {/* Mobile Public Employee - Only for customers */}
              {isCustomer && (
                <Link
                  href="/public-employee"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="mt-3 flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 px-5 py-4 text-base font-bold text-slate-900 shadow-lg shadow-orange-500/30 active:scale-95 transition-transform"
                >
                  <span className="text-2xl">🎖️</span>
                  <span>Public Employee Deals</span>
                  {isVerifiedPE && <BadgeCheck className="w-5 h-5" />}
                </Link>
              )}

              {/* Mobile Cart & Role */}
              <div className="flex items-center gap-3 mt-5 pt-5 border-t border-white/10">
                <div
                  className={`flex items-center gap-2.5 text-sm px-2 ${
                    isAdmin
                      ? "text-red-400"
                      : isSeller
                      ? "text-lime-400"
                      : "text-emerald-400"
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full animate-pulse ${
                      isAdmin
                        ? "bg-red-400"
                        : isSeller
                        ? "bg-lime-400"
                        : "bg-emerald-400"
                    }`}
                  />
                  <span>{roleLabel}</span>
                </div>
                {(isCustomer || isGuest) && (
                  <Link
                    href="/checkout"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex-1 flex items-center justify-center gap-2.5 bg-white text-slate-900 rounded-xl py-3.5 font-bold hover:bg-emerald-50 transition-colors"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    Cart ({count})
                  </Link>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}