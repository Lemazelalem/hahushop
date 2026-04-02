"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

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
          .select("id, created_at, total_cents, status, user_id")
          .order("created_at", { ascending: false });

        if (ordersErr) throw ordersErr;

        const ordersList = orders || [];
        
        // Calculate revenue metrics
        const totalRevenueCents = ordersList.reduce((sum, o) => sum + (o.total_cents || 0), 0);
        const todayOrders = ordersList.filter(o => new Date(o.created_at) >= today);
        const todayRevenueCents = todayOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0);
        const weekOrders = ordersList.filter(o => new Date(o.created_at) >= weekAgo);
        const weekRevenueCents = weekOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0);
        const monthOrdersList = ordersList.filter(o => new Date(o.created_at) >= monthAgo);
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
      {/* HEADER CARD */}
      <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
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

        {/* NAV BUTTONS */}
        <div className="mt-6 flex flex-wrap gap-3">
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
            onClick={() => router.push("/admin/approved-sellers")}
            className="pill px-5 py-3 text-sm font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
          >
            Approved Sellers
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
        </div>
      </section>

      {/* ANALYTICS SECTION */}
      {!loadingAnalytics && analytics && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Platform Analytics</h2>
            <span className="text-xs text-slate-500">Live data</span>
          </div>

          {/* Revenue Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass glass-ring rounded-[28px] p-5 bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
              <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Total Revenue</div>
              <div className="text-2xl font-bold text-slate-900">{moneyCompact(analytics.totalRevenueCents)}</div>
              <div className="text-xs text-slate-500 mt-1">All time</div>
            </div>

            <div className="glass glass-ring rounded-[28px] p-5">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Today</div>
              <div className="text-2xl font-bold text-slate-900">{moneyCompact(analytics.todayRevenueCents)}</div>
              <div className="text-xs text-slate-500 mt-1">{analytics.todayOrders} orders</div>
            </div>

            <div className="glass glass-ring rounded-[28px] p-5">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">This Week</div>
              <div className="text-2xl font-bold text-slate-900">{moneyCompact(analytics.weekRevenueCents)}</div>
              <div className="text-xs text-slate-500 mt-1">{analytics.weekOrders} orders</div>
            </div>

            <div className="glass glass-ring rounded-[28px] p-5">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">This Month</div>
              <div className="text-2xl font-bold text-slate-900">{moneyCompact(analytics.monthRevenueCents)}</div>
              <div className="text-xs text-slate-500 mt-1">{analytics.monthOrders} orders</div>
            </div>
          </div>

          {/* Secondary Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass glass-ring rounded-[28px] p-5">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Total Orders</div>
              <div className="text-2xl font-bold text-slate-900">{analytics.totalOrders.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">Avg: {money(analytics.avgOrderValueCents)}</div>
            </div>

            <div className="glass glass-ring rounded-[28px] p-5">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Customers</div>
              <div className="text-2xl font-bold text-slate-900">{analytics.totalCustomers.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">+{analytics.newCustomersThisMonth} this month</div>
            </div>

            <div className="glass glass-ring rounded-[28px] p-5">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Sellers</div>
              <div className="text-2xl font-bold text-slate-900">{analytics.totalSellers}</div>
              <div className="text-xs text-slate-500 mt-1">{analytics.pendingSellers} pending verification</div>
            </div>

            <div className="glass glass-ring rounded-[28px] p-5">
              <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">Conversion</div>
              <div className="text-2xl font-bold text-slate-900">
                {analytics.totalCustomers > 0 
                  ? Math.round((analytics.totalOrders / analytics.totalCustomers) * 100) 
                  : 0}%
              </div>
              <div className="text-xs text-slate-500 mt-1">Orders per customer</div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Daily Trends Chart */}
            <div className="glass glass-ring rounded-[28px] p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">Revenue Trend (Last 7 Days)</h3>
              </div>
              <div className="flex items-end gap-2 h-32">
                {analytics.dailyTrends.map((day, i) => {
                  const maxRev = Math.max(...analytics.dailyTrends.map(d => d.revenue), 1);
                  const height = maxRev > 0 ? (day.revenue / maxRev) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-slate-100 rounded-t relative" style={{ height: '100%' }}>
                        <div 
                          className="absolute bottom-0 left-0 right-0 bg-emerald-500 rounded-t transition-all duration-500"
                          style={{ height: `${Math.max(height, 4)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500">{day.date}</span>
                      <span className="text-[9px] text-slate-400">{moneyCompact(day.revenue)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Order Status Breakdown */}
            <div className="glass glass-ring rounded-[28px] p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Order Status</h3>
              <div className="space-y-3">
                {Object.entries(analytics.ordersByStatus).map(([status, count]) => (
                  <div key={status}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="capitalize text-slate-600">{status}</span>
                      <span className="font-semibold text-slate-900">{count}</span>
                    </div>
                    <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          status === 'completed' || status === 'paid' ? 'bg-emerald-500' :
                          status === 'cancelled' ? 'bg-red-500' :
                          status === 'pending' ? 'bg-amber-500' : 'bg-blue-500'
                        }`}
                        style={{ 
                          width: `${analytics.totalOrders > 0 ? (count / analytics.totalOrders) * 100 : 0}%` 
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="glass glass-ring rounded-[28px] p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Top Products by Revenue</h3>
            {analytics.topProducts.length > 0 ? (
              <div className="space-y-2">
                {analytics.topProducts.map((product, i) => (
                  <div key={product.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                    <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900 truncate">{product.name}</div>
                      <div className="text-xs text-slate-500">{product.total_sold} sold</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-900">{moneyCompact(product.revenue_cents)}</div>
                      <div className="text-xs text-slate-400">
                        {analytics.totalRevenueCents > 0 
                          ? Math.round((product.revenue_cents / analytics.totalRevenueCents) * 100) 
                          : 0}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">No sales data yet</p>
            )}
          </div>
        </section>
      )}

      {loadingAnalytics && (
        <div className="glass glass-ring rounded-[28px] p-8 text-center">
          <div className="text-sm text-slate-500">Loading analytics…</div>
        </div>
      )}

      {/* PRODUCT STATS GRID */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="glass glass-ring rounded-[28px] p-6">
          <div className="text-sm text-slate-600">Total Products</div>
          <div className="text-4xl font-bold text-slate-900 mt-2">{totalProducts}</div>
          <div className="text-xs text-slate-600 mt-1">All products created by sellers</div>
        </div>

        <div className="glass glass-ring rounded-[28px] p-6">
          <div className="text-sm text-slate-600">Submitted</div>
          <div className="text-4xl font-bold text-slate-900 mt-2">{submitted}</div>
          <div className="text-xs text-slate-600 mt-1">Waiting for admin review</div>
        </div>

        <div className="glass glass-ring rounded-[28px] p-6">
          <div className="text-sm text-slate-600">Approved</div>
          <div className="text-4xl font-bold text-slate-900 mt-2">{approved}</div>
          <div className="text-xs text-slate-600 mt-1">Ready for public shop</div>
        </div>

        <div className="glass glass-ring rounded-[28px] p-6">
          <div className="text-sm text-slate-600">Rejected</div>
          <div className="text-4xl font-bold text-slate-900 mt-2">{rejected}</div>
          <div className="text-xs text-slate-600 mt-1">Need changes from seller</div>
        </div>

        <div className="glass glass-ring rounded-[28px] p-6 border-amber-200">
          <div className="text-sm text-amber-700 font-medium">Delisted</div>
          <div className="text-4xl font-bold text-amber-900 mt-2">{delisted}</div>
          <div className="text-xs text-amber-600 mt-1">Temporarily removed from shop</div>
        </div>

        <div className="glass glass-ring rounded-[28px] p-6 border-rose-200">
          <div className="text-sm text-rose-600 font-medium">Active Promos</div>
          <div className="text-4xl font-bold text-rose-700 mt-2">{activePromotions}</div>
          <div className="text-xs text-rose-500 mt-1">Live discounts running now</div>
        </div>
      </section>
    </main>
  );
}
