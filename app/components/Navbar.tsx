"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMiniCart } from "@/components/MiniCartProvider";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Menu, X, ShoppingCart, BadgeCheck,
  User, Package, CreditCard, Landmark, LayoutDashboard,
  Tag, Sparkles, Phone, ChevronRight, LogIn, UserPlus,
  MapPin, FileText, Shield,
} from "lucide-react";
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
  const router = useRouter();
  const { itemCount: count } = useMiniCart();

  const [isScrolled, setIsScrolled] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

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

  // Swipe from left edge to open drawer
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (touchStartX.current < 40 && dx > 60) setIsDrawerOpen(true);
      else if (dx < -60) setIsDrawerOpen(false);
      touchStartX.current = null;
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    setIsDrawerOpen(false);
    await supabase.auth.signOut();
    router.push("/");
  }, [router]);

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
            onClick={() => setIsDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6" />
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
      </div>

      {/* ─── Left Drawer Overlay ─── */}
      <div
        className={`fixed inset-0 z-[200] transition-all duration-300 ${
          isDrawerOpen ? "visible" : "invisible pointer-events-none"
        }`}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300 ${
            isDrawerOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setIsDrawerOpen(false)}
        />

        {/* Panel */}
        <div
          className={`absolute left-0 top-0 h-full w-[280px] bg-slate-950 border-r border-white/10 flex flex-col shadow-2xl shadow-slate-950/80 transition-transform duration-300 ease-out ${
            isDrawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-5 pt-12 pb-5 border-b border-white/10 flex-shrink-0">
            <Link href="/" onClick={() => setIsDrawerOpen(false)} className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-white via-slate-100 to-slate-200 flex items-center justify-center shadow-lg">
                <span className="text-xl">🛍️</span>
              </div>
              <div className="leading-tight">
                <div className="text-base font-bold text-white">
                  Shop<span className="text-emerald-400">Ease</span>
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Curated for you</div>
              </div>
            </Link>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Role Badge */}
          {authLoaded && profile && (
            <div className="px-5 pt-4 pb-1 flex-shrink-0">
              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${
                  isAdmin
                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                    : isSeller
                    ? "bg-lime-500/10 border-lime-500/30 text-lime-400"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    isAdmin ? "bg-red-400" : isSeller ? "bg-lime-400" : "bg-emerald-400"
                  }`}
                />
                {roleLabel}
              </div>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">

            {/* Account section */}
            {authLoaded && profile && (
              <div>
                <p className="px-3 mb-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Account</p>
                <div className="space-y-0.5">
                  <Link href="/account" onClick={() => setIsDrawerOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                    <User className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                    <span className="text-sm font-medium flex-1">My Account</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                  </Link>

                  {isCustomer && (
                    <>
                      <Link href="/my-orders" onClick={() => setIsDrawerOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                        <Package className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                        <span className="text-sm font-medium flex-1">My Orders</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                      </Link>
                      <Link href="/track" onClick={() => setIsDrawerOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                        <MapPin className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                        <span className="text-sm font-medium flex-1">Track Order</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                      </Link>
                    </>
                  )}

                  {isSeller && (
                    <>
                      <Link href="/seller" onClick={() => setIsDrawerOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                        <LayoutDashboard className="w-4 h-4 text-slate-500 group-hover:text-lime-400 transition-colors flex-shrink-0" />
                        <span className="text-sm font-medium flex-1">Seller Dashboard</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                      </Link>
                      <Link href="/seller/payouts" onClick={() => setIsDrawerOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                        <CreditCard className="w-4 h-4 text-slate-500 group-hover:text-lime-400 transition-colors flex-shrink-0" />
                        <span className="text-sm font-medium flex-1">Payouts</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                      </Link>
                      <Link href="/seller" onClick={() => setIsDrawerOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                        <Landmark className="w-4 h-4 text-slate-500 group-hover:text-lime-400 transition-colors flex-shrink-0" />
                        <span className="text-sm font-medium flex-1">Bank Information</span>
                        <span className="text-[10px] text-slate-600 group-hover:text-slate-500">More tab</span>
                      </Link>
                    </>
                  )}

                  {isAdmin && (
                    <Link href="/admin" onClick={() => setIsDrawerOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                      <LayoutDashboard className="w-4 h-4 text-slate-500 group-hover:text-red-400 transition-colors flex-shrink-0" />
                      <span className="text-sm font-medium flex-1">Admin Dashboard</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Explore */}
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Explore</p>
              <div className="space-y-0.5">
                <Link href="/shop" onClick={() => setIsDrawerOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                  <ShoppingCart className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                  <span className="text-sm font-medium flex-1">Shop</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </Link>
                <Link href="/categories" onClick={() => setIsDrawerOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                  <Tag className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                  <span className="text-sm font-medium flex-1">Categories</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </Link>
                <Link href="/deals" onClick={() => setIsDrawerOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                  <Sparkles className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors flex-shrink-0" />
                  <span className="text-sm font-medium flex-1">Deals</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </Link>
                <Link href="/specials" onClick={() => setIsDrawerOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                  <Tag className="w-4 h-4 text-slate-500 group-hover:text-rose-400 transition-colors flex-shrink-0" />
                  <span className="text-sm font-medium flex-1">Specials</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </Link>
                {isCustomer && (
                  <Link href="/public-employee" onClick={() => setIsDrawerOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition-colors group">
                    <span className="text-base flex-shrink-0">🎖️</span>
                    <span className="text-sm font-medium flex-1">Public Employee</span>
                    <ChevronRight className="w-3.5 h-3.5 text-amber-600 group-hover:text-amber-400 transition-colors" />
                  </Link>
                )}
              </div>
            </div>

            {/* Support */}
            <div>
              <p className="px-3 mb-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Support</p>
              <div className="space-y-0.5">
                <Link href="/contact" onClick={() => setIsDrawerOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                  <Phone className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                  <span className="text-sm font-medium flex-1">Contact Us</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </Link>
                <Link href="/privacy" onClick={() => setIsDrawerOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                  <Shield className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                  <span className="text-sm font-medium flex-1">Privacy Policy</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </Link>
                <Link href="/terms" onClick={() => setIsDrawerOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors group">
                  <FileText className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                  <span className="text-sm font-medium flex-1">Terms of Service</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </Link>
              </div>
            </div>
          </nav>

          {/* Footer: Cart + Sign In/Out */}
          <div className="flex-shrink-0 p-4 border-t border-white/10 space-y-2 pb-8">
            {(isCustomer || isGuest) && (
              <Link href="/checkout" onClick={() => setIsDrawerOpen(false)}
                className="flex items-center justify-center gap-2.5 py-3 rounded-xl bg-white text-slate-900 font-bold text-sm hover:bg-emerald-50 transition-colors relative">
                <ShoppingCart className="w-4 h-4" />
                <span>Cart</span>
                {count > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[1.5rem] text-center">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </Link>
            )}
            {authLoaded && profile ? (
              <button onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white text-sm font-medium transition-all">
                <LogIn className="w-4 h-4 rotate-180" />
                Sign Out
              </button>
            ) : authLoaded ? (
              <div className="grid grid-cols-2 gap-2">
                <Link href="/auth/login" onClick={() => setIsDrawerOpen(false)}
                  className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-sm font-medium transition-all">
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
                <Link href="/auth/signup" onClick={() => setIsDrawerOpen(false)}
                  className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold transition-colors">
                  <UserPlus className="w-4 h-4" />
                  Sign Up
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}