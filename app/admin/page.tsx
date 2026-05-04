"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  Menu, X, ChevronRight, LogOut, Shield,
  Package, ShoppingBag, Users, DollarSign,
  BarChart2, Tag, RotateCcw, FileText, Store, List, CreditCard,
} from "lucide-react";

type ProductStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "archived"
  | "delisted"
  | string;

type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "paid" | "completed";

type AnalyticsData = {
  // Revenue
  totalRevenueCents: number;
  todayRevenueCents: number;
  weekRevenueCents: number;
  monthRevenueCents: number;
  
  // Orders
  totalOrders: number;
  todayOrders: number;
  weekOrders: number;
  monthOrders: number;
  avgOrderValueCents: number;
  
  // Status breakdown
  ordersByStatus: Record<string, number>;
  
  // Customers
  totalCustomers: number;
  newCustomersThisMonth: number;
  
  // Products
  topProducts: { name: string; total_sold: number; revenue_cents: number }[];
  
  // Sellers
  totalSellers: number;
  pendingSellers: number;
  
  // Trends (last 7 days)
  dailyTrends: { date: string; revenue: number; orders: number }[];
};

export default function AdminDashboard() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [totalProducts, setTotalProducts] = useState(0);
  const [submitted, setSubmitted] = useState(0);
  const [approved, setApproved] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [delisted, setDelisted] = useState(0);
  const [businessPending, setBusinessPending] = useState(0);
  const [activePromotions, setActivePromotions] = useState(0);

  // Notification counts
  const [pendingOrders, setPendingOrders] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [pendingSellers, setPendingSellers] = useState(0);
  const [pendingReturns, setPendingReturns] = useState(0);

  // Analytics state
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  // ------------------------------
  // AUTH + ROLE CHECK
  // ------------------------------
  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        const { data: sess, error: sessError } = await supabase.auth.getSession();

        if (sessError) {
          console.error("[admin dashboard] session error:", sessError);
        }

        const user = sess?.session?.user;

        if (!user) {
          router.replace("/auth/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!alive) return;

        if (error) {
          console.error("[admin dashboard] profile role error:", error);
          router.replace("/");
          return;
        }

        if (!data || data.role !== "admin") {
          router.replace("/");
          return;
        }

        setIsAdmin(true);
      } catch (err) {
        console.error("[admin dashboard] auth check error:", err);
        router.replace("/");
      } finally {
        if (alive) setChecking(false);
      }
    }

    run();
    return () => { alive = false; };
  }, [router]);

  // ------------------------------
  // LOAD COUNTS
  // ------------------------------
  useEffect(() => {
    if (!isAdmin) return;

    async function loadCounts() {
      // Products
      const { data, error } = await supabase
        .from("products")
        .select("id, status, is_active");

      if (error) {
        console.error("[admin dashboard] loadCounts error:", error);
      } else {
        const list = (data ?? []) as { status: ProductStatus; is_active?: boolean | null }[];
        setTotalProducts(list.length);
        setSubmitted(list.filter((p) => p.status === "submitted").length);
        setApproved(list.filter((p) => p.status === "approved").length);
        setRejected(list.filter((p) => p.status === "rejected").length);
        setDelisted(
          list.filter((p) => p.status === "delisted" || p.is_active === false).length
        );
      }

      // Business applications pending count
      const { count: bizCount, error: bizErr } = await supabase
        .from("business_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (!bizErr && bizCount !== null) {
        setBusinessPending(bizCount);
      }

      // Active promotions count
      const { count: promoCount, error: promoErr } = await supabase
        .from("promotions")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);

      if (!promoErr && promoCount !== null) {
        setActivePromotions(promoCount);
      }

      // Pending orders count (pending + processing)
      const { count: ordPending, error: ordErr } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "processing"]);

      if (!ordErr && ordPending !== null) {
        setPendingOrders(ordPending);
      }

      // Pending product approvals (submitted status)
      setPendingApprovals(
        (data ?? []).filter((p: { status: ProductStatus }) => p.status === "submitted").length
      );

      // Pending seller verifications (documents awaiting review)
      const { count: sellerPending, error: sellerErr } = await supabase
        .from("seller_documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (!sellerErr && sellerPending !== null) {
        setPendingSellers(sellerPending);
      }

      // Pending returns
      const { count: retCount, error: retErr } = await supabase
        .from("returns")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (!retErr && retCount !== null) {
        setPendingReturns(retCount);
      }
    }

    loadCounts();
  }, [isAdmin]);

  // ------------------------------
  // LOAD ANALYTICS
  // ------------------------------
  useEffect(() => {
    if (!isAdmin) return;

    async function loadAnalytics() {
      setLoadingAnalytics(true);
      try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(today.getFullYear(), today.getMonth(), 1);

        // Get all orders
        const { data: orders, error: ordersErr } = await supabase
          .from("orders")
          .select("id, created_at, total_cents, status, payment_status, user_id")
          .order("created_at", { ascending: false });

        if (ordersErr) throw ordersErr;

        const ordersList = orders || [];
        const paidOrders = ordersList.filter(o => o.payment_status === "paid");

        // Calculate revenue metrics — only count orders that have actually been paid
        const totalRevenueCents = paidOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0);
        const todayOrders = paidOrders.filter(o => new Date(o.created_at) >= today);
        const todayRevenueCents = todayOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0);
        const weekOrders = paidOrders.filter(o => new Date(o.created_at) >= weekAgo);
        const weekRevenueCents = weekOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0);
        const monthOrdersList = paidOrders.filter(o => new Date(o.created_at) >= monthAgo);
        const monthRevenueCents = monthOrdersList.reduce((sum, o) => sum + (o.total_cents || 0), 0);

        // Status breakdown
        const ordersByStatus: Record<string, number> = {};
        ordersList.forEach(o => {
          ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
        });

        // Unique customers
        const uniqueCustomers = new Set(ordersList.map(o => o.user_id));
        const thisMonthCustomers = new Set(
          monthOrdersList.map(o => o.user_id)
        );

        // Get top products from order_items
        const { data: orderItems, error: itemsErr } = await supabase
          .from("order_items")
          .select("name_snapshot, quantity, line_total_cents");

        if (itemsErr) throw itemsErr;

        const productMap: Record<string, { name: string; total_sold: number; revenue_cents: number }> = {};
        orderItems?.forEach(item => {
          const name = item.name_snapshot || "Unknown";
          if (!productMap[name]) {
            productMap[name] = { name, total_sold: 0, revenue_cents: 0 };
          }
          productMap[name].total_sold += item.quantity || 0;
          productMap[name].revenue_cents += item.line_total_cents || 0;
        });

        const topProducts = Object.values(productMap)
          .sort((a, b) => b.revenue_cents - a.revenue_cents)
          .slice(0, 5);

        // Get seller counts (multi-source: products.seller_id + seller_documents + server API for profiles)
        const sellerIdSet = new Set<string>();
        // From products
        const { data: prodSellers } = await supabase
          .from("products")
          .select("seller_id");
        for (const p of prodSellers ?? []) {
          if (p.seller_id) sellerIdSet.add(p.seller_id);
        }
        // From seller_documents
        const { data: docSellers } = await supabase
          .from("seller_documents")
          .select("seller_id");
        for (const d of docSellers ?? []) {
          if (d.seller_id) sellerIdSet.add(d.seller_id);
        }
        // From profiles.role = 'seller' (via server API to bypass RLS)
        try {
          const roleRes = await fetch("/api/admin/profiles?role=seller");
          if (roleRes.ok) {
            const roleData = await roleRes.json();
            for (const r of roleData.profiles ?? []) {
              if (r.id) sellerIdSet.add(r.id);
            }
          }
        } catch { /* ignore fetch errors for count */ }
        const totalSellersCount = sellerIdSet.size;

        // Pending seller verifications (documents awaiting review)
        const { count: pendingSellerDocsCount } = await supabase
          .from("seller_documents")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending");

        // Daily trends (last 7 days)
        const dailyTrends: { date: string; revenue: number; orders: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const dayOrders = ordersList.filter(o => o.created_at.startsWith(dateStr));
          dailyTrends.push({
            date: d.toLocaleDateString('en-US', { weekday: 'short' }),
            revenue: dayOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0),
            orders: dayOrders.length
          });
        }

        setAnalytics({
          totalRevenueCents,
          todayRevenueCents,
          weekRevenueCents,
          monthRevenueCents,
          totalOrders: ordersList.length,
          todayOrders: todayOrders.length,
          weekOrders: weekOrders.length,
          monthOrders: monthOrdersList.length,
          avgOrderValueCents: ordersList.length ? Math.round(totalRevenueCents / ordersList.length) : 0,
          ordersByStatus,
          totalCustomers: uniqueCustomers.size,
          newCustomersThisMonth: thisMonthCustomers.size,
          topProducts,
          totalSellers: totalSellersCount,
          pendingSellers: pendingSellerDocsCount || 0,
          dailyTrends
        });

      } catch (err) {
        console.error("[admin dashboard] analytics error:", err);
      } finally {
        setLoadingAnalytics(false);
      }
    }

    loadAnalytics();
  }, [isAdmin]);

  // ------------------------------
  // LOGOUT
  // ------------------------------
  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[admin dashboard] logout error:", err);
    } finally {
      router.replace("/auth/login");
    }
  }

  // ------------------------------
  // HELPERS
  // ------------------------------
  function money(cents: number): string {
    return `ETB ${(cents / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function moneyCompact(cents: number): string {
    const v = cents / 100;
    if (v >= 1_000_000) return `ETB ${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `ETB ${(v / 1_000).toFixed(1)}K`;
    return `ETB ${v.toFixed(0)}`;
  }

  // ------------------------------
  // LOADING / GUARD
  // ------------------------------
  if (checking) {
    return (
      <main className="py-4 md:py-6">
        <div className="glass glass-ring rounded-[28px] p-6 text-sm text-slate-700">
          Checking admin access…
        </div>
      </main>
    );
  }

  if (!isAdmin) return null;

  // ------------------------------
  // MAIN ADMIN DASHBOARD UI
  // ------------------------------
  return (
    <main className="py-4 md:py-6 space-y-6">

      {/* ── LEFT SIDE DRAWER (mobile) ── */}
      <div className={`fixed inset-0 z-[300] transition-all duration-300 ${isDrawerOpen ? "visible" : "invisible pointer-events-none"}`}>
        <div
          className={`absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 ${isDrawerOpen ? "opacity-100" : "opacity-0"}`}
          onClick={() => setIsDrawerOpen(false)}
        />
        <div className={`absolute left-0 top-0 h-full w-72 bg-white flex flex-col shadow-2xl transition-transform duration-300 ease-out ${isDrawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
          {/* Drawer header */}
          <div className="flex items-center justify-between px-5 pt-12 pb-4 bg-gradient-to-br from-slate-800 to-slate-900 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-base leading-tight">Admin Panel</p>
                <p className="text-white/70 text-xs">Store Management</p>
              </div>
            </div>
            <button onClick={() => setIsDrawerOpen(false)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">

            {/* Products */}
            <div>
              <p className="px-3 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Products</p>
              <div className="space-y-0.5">
                <button onClick={() => { router.push("/admin/approvals"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <Package className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Product Approvals</span>
                  {pendingApprovals > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "linear-gradient(90deg,#f59e0b,#f97316)" }}>{pendingApprovals}</span>}
                </button>
                <button onClick={() => { router.push("/admin/products"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <List className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Products (Delist)</span>
                </button>
                <button onClick={() => { router.push("/admin/delisted"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <BarChart2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Delisted Products</span>
                </button>
                <button onClick={() => { router.push("/admin/stock"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <Package className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Stock Table</span>
                </button>
              </div>
            </div>

            {/* Operations */}
            <div>
              <p className="px-3 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Operations</p>
              <div className="space-y-0.5">
                <button onClick={() => { router.push("/admin/orders"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <ShoppingBag className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Orders &amp; Checkout</span>
                  {pendingOrders > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white animate-pulse" style={{ background: "linear-gradient(90deg,#ef4444,#ec4899)" }}>{pendingOrders}</span>}
                </button>
                <button onClick={() => { router.push("/admin/returns"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <RotateCcw className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Returns</span>
                  {pendingReturns > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "linear-gradient(90deg,#0ea5e9,#06b6d4)" }}>{pendingReturns}</span>}
                </button>
              </div>
            </div>

            {/* Sellers */}
            <div>
              <p className="px-3 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sellers</p>
              <div className="space-y-0.5">
                <button onClick={() => { router.push("/admin/sellers"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Seller Verification</span>
                  {pendingSellers > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "linear-gradient(90deg,#8b5cf6,#6366f1)" }}>{pendingSellers}</span>}
                </button>
                <button onClick={() => { router.push("/admin/approved-sellers"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <Store className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Approved Sellers</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
                <button onClick={() => { router.push("/admin/payouts"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <DollarSign className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Seller Payouts</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Marketing */}
            <div>
              <p className="px-3 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Marketing</p>
              <div className="space-y-0.5">
                <button onClick={() => { router.push("/admin/hero"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <BarChart2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Hero Management</span>
                </button>
                <button onClick={() => { router.push("/admin/promotions"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <Tag className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Promotions</span>
                  {activePromotions > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "linear-gradient(90deg,#f43f5e,#fb923c)" }}>{activePromotions}</span>}
                </button>
              </div>
            </div>

            {/* Other */}
            <div>
              <p className="px-3 mb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Other</p>
              <div className="space-y-0.5">
                <button onClick={() => { router.push("/admin/public-employee"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Public Employee Docs</span>
                </button>
                <button onClick={() => { router.push("/admin/business"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Business Applications</span>
                  {businessPending > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "linear-gradient(90deg,#a3e635,#22d3ee)", color: "#0f172a" }}>{businessPending}</span>}
                </button>
                <button onClick={() => { router.push("/admin/payment-controls"); setIsDrawerOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
                  <CreditCard className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="flex-1 text-left">Payment Controls</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </div>
          </nav>

          {/* Sign out */}
          <div className="flex-shrink-0 p-4 border-t border-slate-200 pb-8">
            <button
              onClick={async () => { setIsDrawerOpen(false); await supabase.auth.signOut(); router.push("/auth/login"); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-sm font-semibold transition-all border border-slate-200 hover:border-rose-200"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* HEADER CARD */}
      <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
        {/* Mobile: hamburger row */}
        <div className="md:hidden flex items-center justify-between mb-4">
          <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Admin Dashboard</span>
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="p-2 rounded-xl hover:bg-slate-100 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5 text-slate-700" />
          </button>
        </div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="hidden md:block text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
              Admin
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mt-1">
              Admin Dashboard
            </h1>
            <p className="text-sm md:text-base text-slate-700 mt-1">
              Review seller products, monitor orders, verify sellers, manage delisted items,
              and control seller payouts.
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="pill px-5 py-2 text-sm font-semibold text-rose-600"
          >
            Logout
          </button>
        </div>

        {/* NAV BUTTONS — desktop only; mobile uses drawer */}
        <div className="mt-6 hidden md:flex flex-wrap gap-3">
          <button
            onClick={() => router.push("/admin/approvals")}
            className="pill px-5 py-3 text-sm font-semibold relative flex items-center gap-2"
          >
            Product Approvals
            {pendingApprovals > 0 && (
              <span
                className="inline-flex items-center justify-center text-xs font-black rounded-full px-2 py-0.5 min-w-[22px]"
                style={{
                  background: "linear-gradient(90deg,#f59e0b,#f97316)",
                  color: "#fff",
                  fontSize: 10,
                }}
              >
                {pendingApprovals}
              </span>
            )}
          </button>

          <button
            onClick={() => router.push("/admin/products")}
            className="pill px-5 py-3 text-sm font-semibold"
          >
            Products (Delist)
          </button>

          <button
            onClick={() => router.push("/admin/orders")}
            className="pill px-5 py-3 text-sm font-semibold relative flex items-center gap-2"
          >
            Orders &amp; Checkout
            {pendingOrders > 0 && (
              <span
                className="inline-flex items-center justify-center text-xs font-black rounded-full px-2 py-0.5 min-w-[22px] animate-pulse"
                style={{
                  background: "linear-gradient(90deg,#ef4444,#ec4899)",
                  color: "#fff",
                  fontSize: 10,
                }}
              >
                {pendingOrders}
              </span>
            )}
          </button>

          <button
            onClick={() => router.push("/admin/sellers")}
            className="pill px-5 py-3 text-sm font-semibold relative flex items-center gap-2"
          >
            Seller Verification
            {pendingSellers > 0 && (
              <span
                className="inline-flex items-center justify-center text-xs font-black rounded-full px-2 py-0.5 min-w-[22px]"
                style={{
                  background: "linear-gradient(90deg,#8b5cf6,#6366f1)",
                  color: "#fff",
                  fontSize: 10,
                }}
              >
                {pendingSellers}
              </span>
            )}
          </button>

          <button
            onClick={() => router.push("/admin/public-employee")}
            className="pill px-5 py-3 text-sm font-semibold"
          >
            Public Employee Docs
          </button>

          <button
            onClick={() => router.push("/admin/hero")}
            className="pill px-5 py-3 text-sm font-semibold"
          >
            Hero Management
          </button>

          <button
            onClick={() => router.push("/admin/payouts")}
            className="pill px-5 py-3 text-sm font-semibold"
          >
            Seller Payouts
          </button>

          <button
            onClick={() => router.push("/admin/stock")}
            className="pill px-5 py-3 text-sm font-semibold bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
          >
            Stock Table
          </button>

          <button
            onClick={() => router.push("/admin/approved-sellers")}
            className="pill px-5 py-3 text-sm font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
          >
            Approved Sellers
          </button>

          <button
            onClick={() => router.push("/admin/customers")}
            className="pill px-5 py-3 text-sm font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors flex items-center gap-2"
          >
            👥 Customer Data
          </button>

          <button
            onClick={() => router.push("/admin/delisted")}
            className="pill px-5 py-3 text-sm font-semibold bg-amber-50 text-amber-700 border border-amber-200"
          >
            Delisted Products
          </button>

          {/* Returns Button - Added */}
          <button
            onClick={() => router.push("/admin/returns")}
            className="pill px-5 py-3 text-sm font-semibold relative flex items-center gap-2 bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
          >
            📦 Returns
            {pendingReturns > 0 && (
              <span
                className="inline-flex items-center justify-center text-xs font-black rounded-full px-2 py-0.5 min-w-[22px]"
                style={{
                  background: "linear-gradient(90deg,#0ea5e9,#06b6d4)",
                  color: "#fff",
                  fontSize: 10,
                }}
              >
                {pendingReturns}
              </span>
            )}
          </button>

          {/* Promotions — with active badge */}
          <button
            onClick={() => router.push("/admin/promotions")}
            className="pill px-5 py-3 text-sm font-semibold relative flex items-center gap-2 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
          >
            🏷️ Promotions
            {activePromotions > 0 && (
              <span
                className="inline-flex items-center justify-center text-xs font-black rounded-full px-2 py-0.5 min-w-[22px]"
                style={{
                  background: "linear-gradient(90deg,#f43f5e,#fb923c)",
                  color: "#fff",
                  fontSize: 10,
                }}
              >
                {activePromotions}
              </span>
            )}
          </button>

          {/* Business Applications — with pending badge */}
          <button
            onClick={() => router.push("/admin/business")}
            className="pill px-5 py-3 text-sm font-semibold relative flex items-center gap-2"
            style={{
              background: "linear-gradient(135deg,#0f172a,#1e293b)",
              color: "#fff",
              border: "1px solid rgba(163,230,53,0.4)",
            }}
          >
            💼 Business Applications
            {businessPending > 0 && (
              <span
                className="inline-flex items-center justify-center text-xs font-black rounded-full px-2 py-0.5 min-w-[22px]"
                style={{
                  background: "linear-gradient(90deg,#a3e635,#22d3ee)",
                  color: "#0f172a",
                  fontSize: 10,
                }}
              >
                {businessPending}
              </span>
            )}
          </button>

          {/* Payment Controls */}
          <button
            onClick={() => router.push("/admin/payment-controls")}
            className="pill px-5 py-3 text-sm font-semibold flex items-center gap-2 bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            Payment Controls
          </button>
        </div>
      </section>

      {/* ANALYTICS SECTION */}
      {loadingAnalytics && (
        <section className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="glass glass-ring rounded-[28px] p-5 animate-pulse bg-slate-100 h-24" />
            ))}
          </div>
        </section>
      )}

      {!loadingAnalytics && analytics && (
        <section className="space-y-4">

          {/* Section header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Platform Analytics</h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>

          {/* Revenue row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass glass-ring rounded-[28px] p-5 bg-gradient-to-br from-emerald-50 to-white border-emerald-200 lg:col-span-1">
              <div className="text-lg mb-1">💰</div>
              <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">Total Revenue</div>
              <div className="text-2xl font-bold text-slate-900">{moneyCompact(analytics.totalRevenueCents)}</div>
              <div className="text-xs text-slate-500 mt-1">All time · paid orders</div>
            </div>

            <div className="glass glass-ring rounded-[28px] p-5 bg-gradient-to-br from-sky-50 to-white border-sky-200">
              <div className="text-lg mb-1">📅</div>
              <div className="text-xs font-semibold text-sky-700 uppercase tracking-wide mb-1">Today</div>
              <div className="text-2xl font-bold text-slate-900">{moneyCompact(analytics.todayRevenueCents)}</div>
              <div className="text-xs text-slate-500 mt-1">{analytics.todayOrders} orders</div>
            </div>

            <div className="glass glass-ring rounded-[28px] p-5 bg-gradient-to-br from-violet-50 to-white border-violet-200">
              <div className="text-lg mb-1">📆</div>
              <div className="text-xs font-semibold text-violet-700 uppercase tracking-wide mb-1">This Week</div>
              <div className="text-2xl font-bold text-slate-900">{moneyCompact(analytics.weekRevenueCents)}</div>
              <div className="text-xs text-slate-500 mt-1">{analytics.weekOrders} orders</div>
            </div>

            <div className="glass glass-ring rounded-[28px] p-5 bg-gradient-to-br from-fuchsia-50 to-white border-fuchsia-200">
              <div className="text-lg mb-1">🗓️</div>
              <div className="text-xs font-semibold text-fuchsia-700 uppercase tracking-wide mb-1">This Month</div>
              <div className="text-2xl font-bold text-slate-900">{moneyCompact(analytics.monthRevenueCents)}</div>
              <div className="text-xs text-slate-500 mt-1">{analytics.monthOrders} orders</div>
            </div>
          </div>

          {/* Key metrics row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass glass-ring rounded-[28px] p-5 bg-gradient-to-br from-slate-50 to-white">
              <div className="text-lg mb-1">🛒</div>
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Total Orders</div>
              <div className="text-2xl font-bold text-slate-900">{analytics.totalOrders.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">Avg {money(analytics.avgOrderValueCents)}</div>
            </div>

            <div className="glass glass-ring rounded-[28px] p-5 bg-gradient-to-br from-indigo-50 to-white border-indigo-200">
              <div className="text-lg mb-1">👤</div>
              <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-1">Customers</div>
              <div className="text-2xl font-bold text-slate-900">{analytics.totalCustomers.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">+{analytics.newCustomersThisMonth} this month</div>
            </div>

            <div className="glass glass-ring rounded-[28px] p-5 bg-gradient-to-br from-teal-50 to-white border-teal-200">
              <div className="text-lg mb-1">🏪</div>
              <div className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-1">Sellers</div>
              <div className="text-2xl font-bold text-slate-900">{analytics.totalSellers}</div>
              <div className="text-xs text-slate-500 mt-1">{analytics.pendingSellers} awaiting verification</div>
            </div>

            <div className="glass glass-ring rounded-[28px] p-5 bg-gradient-to-br from-amber-50 to-white border-amber-200">
              <div className="text-lg mb-1">📊</div>
              <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Orders / Customer</div>
              <div className="text-2xl font-bold text-slate-900">
                {analytics.totalCustomers > 0
                  ? (analytics.totalOrders / analytics.totalCustomers).toFixed(1)
                  : "0"}
              </div>
              <div className="text-xs text-slate-500 mt-1">avg orders per account</div>
            </div>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Revenue trend — 7-day bar chart */}
            <div className="glass glass-ring rounded-[28px] p-5 md:p-6 bg-white lg:col-span-2">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Revenue — Last 7 Days</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Paid orders only</p>
                </div>
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
                  {moneyCompact(analytics.weekRevenueCents)} this week
                </span>
              </div>
              <div className="flex items-end gap-2 h-32">
                {analytics.dailyTrends.map((day, i) => {
                  const maxRev = Math.max(...analytics.dailyTrends.map(d => d.revenue), 1);
                  const height = maxRev > 0 ? (day.revenue / maxRev) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                      <span className="text-[9px] font-semibold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        {day.revenue > 0 ? moneyCompact(day.revenue) : ""}
                      </span>
                      <div className="w-full relative flex-1 flex items-end">
                        <div
                          className="w-full rounded-t bg-emerald-500 hover:bg-emerald-400 transition-colors cursor-default"
                          style={{ height: `${Math.max(height, day.revenue > 0 ? 6 : 0)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500">{day.date}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Order status breakdown */}
            <div className="glass glass-ring rounded-[28px] p-5 md:p-6 bg-white">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Order Status</h3>
              <div className="space-y-3">
                {Object.entries(analytics.ordersByStatus)
                  .sort(([, a], [, b]) => b - a)
                  .map(([status, count]) => {
                    const pct = analytics.totalOrders > 0
                      ? Math.round((count / analytics.totalOrders) * 100)
                      : 0;
                    const color =
                      status === "completed" || status === "paid" ? "bg-emerald-500" :
                      status === "cancelled" ? "bg-rose-400" :
                      status === "pending" ? "bg-amber-400" :
                      status === "processing" ? "bg-sky-400" :
                      status === "shipped" ? "bg-violet-400" : "bg-slate-400";
                    const textColor =
                      status === "completed" || status === "paid" ? "text-emerald-700 bg-emerald-50" :
                      status === "cancelled" ? "text-rose-700 bg-rose-50" :
                      status === "pending" ? "text-amber-700 bg-amber-50" :
                      status === "processing" ? "text-sky-700 bg-sky-50" :
                      status === "shipped" ? "text-violet-700 bg-violet-50" : "text-slate-700 bg-slate-50";
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${textColor}`}>
                            {status}
                          </span>
                          <span className="text-xs font-bold text-slate-700">
                            {count} <span className="text-slate-400 font-normal">({pct}%)</span>
                          </span>
                        </div>
                        <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full rounded-full ${color} transition-all duration-500`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Top products */}
          <div className="glass glass-ring rounded-[28px] p-5 md:p-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Top Products by Revenue</h3>
              <span className="text-xs text-slate-400">customer-facing price</span>
            </div>
            {analytics.topProducts.length > 0 ? (
              <div className="space-y-3">
                {analytics.topProducts.map((product, i) => {
                  const maxRev = Math.max(...analytics.topProducts.map(p => p.revenue_cents), 1);
                  const barWidth = (product.revenue_cents / maxRev) * 100;
                  const pct = analytics.totalRevenueCents > 0
                    ? Math.round((product.revenue_cents / analytics.totalRevenueCents) * 100)
                    : 0;
                  const rankColors = ["bg-amber-400 text-amber-900", "bg-slate-300 text-slate-700", "bg-orange-300 text-orange-900"];
                  return (
                    <div key={product.name} className="flex items-center gap-3 group">
                      <span className={`w-6 h-6 flex items-center justify-center text-[10px] font-black rounded-full flex-shrink-0 ${rankColors[i] ?? "bg-slate-100 text-slate-500"}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-900 truncate">{product.name}</span>
                          <span className="text-sm font-bold text-slate-900 ml-3 flex-shrink-0">{moneyCompact(product.revenue_cents)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                              style={{ width: `${barWidth}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">{product.total_sold} sold · {pct}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="text-3xl mb-2">📦</div>
                <p className="text-sm text-slate-400">No sales data yet</p>
              </div>
            )}
          </div>

        </section>
      )}

      {/* PRODUCT STATS GRID */}
      <section>
        <h2 className="text-base font-bold text-slate-700 mb-3">Product Catalogue</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="glass glass-ring rounded-[24px] p-5 bg-gradient-to-br from-slate-50 to-white">
            <div className="text-xl mb-2">📦</div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Total</div>
            <div className="text-3xl font-bold text-slate-900">{totalProducts}</div>
            <div className="text-[11px] text-slate-400 mt-1">all products</div>
          </div>

          <div className="glass glass-ring rounded-[24px] p-5 bg-gradient-to-br from-sky-50 to-white border-sky-200">
            <div className="text-xl mb-2">📬</div>
            <div className="text-xs font-semibold text-sky-600 uppercase tracking-wide mb-1">Submitted</div>
            <div className="text-3xl font-bold text-slate-900">{submitted}</div>
            <div className="text-[11px] text-slate-400 mt-1">awaiting review</div>
          </div>

          <div className="glass glass-ring rounded-[24px] p-5 bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
            <div className="text-xl mb-2">✅</div>
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Approved</div>
            <div className="text-3xl font-bold text-slate-900">{approved}</div>
            <div className="text-[11px] text-slate-400 mt-1">live in shop</div>
          </div>

          <div className="glass glass-ring rounded-[24px] p-5 bg-gradient-to-br from-rose-50 to-white border-rose-200">
            <div className="text-xl mb-2">❌</div>
            <div className="text-xs font-semibold text-rose-600 uppercase tracking-wide mb-1">Rejected</div>
            <div className="text-3xl font-bold text-slate-900">{rejected}</div>
            <div className="text-[11px] text-slate-400 mt-1">needs changes</div>
          </div>

          <div className="glass glass-ring rounded-[24px] p-5 bg-gradient-to-br from-amber-50 to-white border-amber-200">
            <div className="text-xl mb-2">🚫</div>
            <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Delisted</div>
            <div className="text-3xl font-bold text-amber-900">{delisted}</div>
            <div className="text-[11px] text-slate-400 mt-1">removed from shop</div>
          </div>

          <div className="glass glass-ring rounded-[24px] p-5 bg-gradient-to-br from-fuchsia-50 to-white border-fuchsia-200">
            <div className="text-xl mb-2">🏷️</div>
            <div className="text-xs font-semibold text-fuchsia-700 uppercase tracking-wide mb-1">Promos</div>
            <div className="text-3xl font-bold text-fuchsia-800">{activePromotions}</div>
            <div className="text-[11px] text-slate-400 mt-1">live discounts</div>
          </div>
        </div>
      </section>
    </main>
  );
}
