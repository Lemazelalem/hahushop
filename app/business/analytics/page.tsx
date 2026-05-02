// app/business/analytics/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Package,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════════════ */

type BusinessProfile = {
  business_org_name: string | null;
  business_payment_terms: "net_30" | "net_60" | null;
  business_credit_limit_cents: number | null;
  business_credit_used_cents: number | null;
};

type MonthlySpend = {
  month: string;
  year: number;
  total_cents: number;
  order_count: number;
};

type TopItem = {
  name: string;
  emoji: string | null;
  image_url: string | null;
  total_quantity: number;
  total_cents: number;
};

type OrderStatusBreakdown = {
  status: string;
  count: number;
  total_cents: number;
};

type AnalyticsData = {
  total_spent_cents: number;
  total_orders: number;
  avg_order_cents: number;
  largest_order_cents: number;
  monthly: MonthlySpend[];
  top_items: TopItem[];
  status_breakdown: OrderStatusBreakdown[];
  this_month_cents: number;
  last_month_cents: number;
};

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════════════ */

function money(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return "ETB 0.00";
  return `ETB ${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function moneyCompact(cents: number): string {
  if (!cents || cents <= 0) return "ETB 0";
  const v = cents / 100;
  if (v >= 1_000_000) return `ETB ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `ETB ${(v / 1_000).toFixed(1)}K`;
  return `ETB ${v.toFixed(0)}`;
}

function pct(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function statusColor(status: string): string {
  if (status === "completed" || status === "paid") return "#15803d";
  if (status === "cancelled") return "#dc2626";
  if (status === "pending") return "#d97706";
  return "#6b7280";
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/* ══════════════════════════════════════════════════════════════════════════════
   BAR CHART
══════════════════════════════════════════════════════════════════════════════ */

function BarChart({ data }: { data: MonthlySpend[] }) {
  const max = Math.max(...data.map((d) => d.total_cents), 1);

  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map((d, i) => {
        const h = Math.max(d.total_cents > 0 ? 5 : 0, (d.total_cents / max) * 100);
        const isCurrentMonth = i === data.length - 1;

        return (
          <div
            key={`${d.month}-${d.year}`}
            className="flex-1 flex flex-col items-center gap-1 group relative"
          >
            {/* Hover tooltip */}
            <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {moneyCompact(d.total_cents)}
              <br />
              <span className="text-slate-400 font-normal">
                {d.order_count} order{d.order_count !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Bar */}
            <div className="w-full flex-1 flex items-end">
              <div
                className={`w-full rounded-t transition-all duration-500 ${
                  isCurrentMonth ? "bg-emerald-500 hover:bg-emerald-400" :
                  d.total_cents > 0 ? "bg-slate-300 hover:bg-slate-400" : "bg-slate-100"
                }`}
                style={{ height: `${h}%` }}
              />
            </div>

            {/* Label */}
            <span className={`text-[9px] font-semibold ${isCurrentMonth ? "text-emerald-600" : "text-slate-400"}`}>
              {d.month}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════════ */

export default function BusinessAnalyticsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);

        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;

        const user = authData?.user;
        if (!user) {
          router.replace("/auth/login?redirect=/business/analytics");
          return;
        }

        // Check business account
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select(
            "is_business_account, business_org_name, business_payment_terms, business_credit_limit_cents, business_credit_used_cents"
          )
          .eq("id", user.id)
          .maybeSingle();

        if (profErr) throw profErr;
        if (!alive) return;

        if (!prof?.is_business_account) {
          setAccessDenied(true);
          setLoading(false);
          return;
        }

        setProfile({
          business_org_name: prof.business_org_name ?? null,
          business_payment_terms: (prof.business_payment_terms ?? "net_30") as
            | "net_30"
            | "net_60",
          business_credit_limit_cents: prof.business_credit_limit_cents ?? null,
          business_credit_used_cents: prof.business_credit_used_cents ?? null,
        });

        // Load all orders
        const { data: orders, error: ordersError } = await supabase
          .from("orders")
          .select("id, created_at, total_cents, subtotal_cents, status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: true });

        if (ordersError) throw ordersError;
        if (!alive) return;

        if (!orders?.length) {
          setData({
            total_spent_cents: 0,
            total_orders: 0,
            avg_order_cents: 0,
            largest_order_cents: 0,
            monthly: buildEmptyMonths(),
            top_items: [],
            status_breakdown: [],
            this_month_cents: 0,
            last_month_cents: 0,
          });
          setLoading(false);
          return;
        }

        // Load order_items for top products
        const orderIds = orders.map((o: any) => o.id);
        const { data: items, error: itemsErr } = await supabase
          .from("order_items")
          .select(
            "name_snapshot, emoji_snapshot, image_url_snapshot, quantity, line_total_cents, order_id"
          )
          .in("order_id", orderIds);

        if (itemsErr) throw itemsErr;
        if (!alive) return;

        // ── Compute analytics ────────────────────────────
        const total_spent_cents = orders.reduce(
          (s: number, o: any) => s + (o.total_cents ?? 0),
          0
        );
        const total_orders = orders.length;
        const avg_order_cents = total_orders
          ? Math.round(total_spent_cents / total_orders)
          : 0;
        const largest_order_cents = Math.max(
          ...orders.map((o: any) => o.total_cents ?? 0),
          0
        );

        // Monthly spend — last 6 months
        const monthly = buildMonthlySpend(orders);

        // This month vs last month
        const now = new Date();
        const thisMonthStr = `${now.getFullYear()}-${String(
          now.getMonth() + 1
        ).padStart(2, "0")}`;
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthStr = `${lastMonth.getFullYear()}-${String(
          lastMonth.getMonth() + 1
        ).padStart(2, "0")}`;

        const this_month_cents = orders
          .filter((o: any) => String(o.created_at).slice(0, 7) === thisMonthStr)
          .reduce((s: number, o: any) => s + (o.total_cents ?? 0), 0);

        const last_month_cents = orders
          .filter((o: any) => String(o.created_at).slice(0, 7) === lastMonthStr)
          .reduce((s: number, o: any) => s + (o.total_cents ?? 0), 0);

        // Top items
        const itemMap: Record<string, TopItem> = {};
        for (const item of items ?? []) {
          const key = (item as any).name_snapshot ?? "Unknown";
          if (!itemMap[key]) {
            itemMap[key] = {
              name: key,
              emoji: (item as any).emoji_snapshot ?? null,
              image_url: (item as any).image_url_snapshot ?? null,
              total_quantity: 0,
              total_cents: 0,
            };
          }
          itemMap[key].total_quantity += (item as any).quantity ?? 0;
          itemMap[key].total_cents += (item as any).line_total_cents ?? 0;
        }
        const top_items = Object.values(itemMap)
          .sort((a, b) => b.total_cents - a.total_cents)
          .slice(0, 8);

        // Status breakdown
        const statusMap: Record<string, OrderStatusBreakdown> = {};
        for (const o of orders as any[]) {
          const s = o.status ?? "unknown";
          if (!statusMap[s]) statusMap[s] = { status: s, count: 0, total_cents: 0 };
          statusMap[s].count += 1;
          statusMap[s].total_cents += o.total_cents ?? 0;
        }
        const status_breakdown = Object.values(statusMap).sort((a, b) => b.count - a.count);

        if (!alive) return;

        setData({
          total_spent_cents,
          total_orders,
          avg_order_cents,
          largest_order_cents,
          monthly,
          top_items,
          status_breakdown,
          this_month_cents,
          last_month_cents,
        });
        setLoading(false);
      } catch (err) {
        console.error("[analytics] load error:", err);
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [router]);

  /* ── Access denied ──────────────────────────────────── */
  if (!loading && accessDenied) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex items-center justify-center px-4">
        <div className="glass glass-ring rounded-[28px] p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-base font-bold text-slate-900 mb-2">Business Account Required</h1>
          <p className="text-sm text-slate-500 mb-6">
            Analytics are only available to approved business accounts.
          </p>
          <Link
            href="/business"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl font-semibold text-xs text-white transition-colors"
            style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)" }}
          >
            <Briefcase className="w-3.5 h-3.5" />
            Apply for Business Account
          </Link>
        </div>
      </div>
    );
  }

  /* ── Loading ────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 px-4 py-8">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="glass glass-ring rounded-[28px] p-6 animate-pulse bg-slate-100 h-24" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass glass-ring rounded-[24px] p-5 animate-pulse bg-slate-100 h-20" />
            ))}
          </div>
          <div className="glass glass-ring rounded-[28px] p-6 animate-pulse bg-slate-100 h-40" />
        </div>
      </div>
    );
  }

  const mom =
    data!.last_month_cents > 0
      ? Math.round(
          ((data!.this_month_cents - data!.last_month_cents) / data!.last_month_cents) * 100
        )
      : null;

  const creditUtil =
    profile?.business_credit_limit_cents
      ? pct(profile.business_credit_used_cents ?? 0, profile.business_credit_limit_cents)
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 py-6 px-4">
      <div className="max-w-5xl mx-auto space-y-4">

        {/* Header */}
        <div className="glass glass-ring rounded-[28px] p-5 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => router.push("/business")}
              className="pill px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Business
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl"
                style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)" }}>
                📊
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900">Spend Analytics</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  {profile?.business_org_name ?? "Your Organization"} · All-time report
                </p>
              </div>
            </div>
            <Link
              href="/invoices"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold text-white transition-colors"
              style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)" }}
            >
              View Invoices
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Spent",    value: moneyCompact(data!.total_spent_cents),    sub: "All time",      emoji: "💰", bg: "from-emerald-50 to-white", border: "border-emerald-200", color: "text-emerald-700" },
            { label: "Total Orders",   value: String(data!.total_orders),               sub: "All time",      emoji: "🛒", bg: "from-sky-50 to-white",     border: "border-sky-200",     color: "text-sky-700"     },
            { label: "Avg. Order",     value: moneyCompact(data!.avg_order_cents),      sub: "Per order",     emoji: "📦", bg: "from-violet-50 to-white",  border: "border-violet-200",  color: "text-violet-700"  },
            { label: "Largest Order",  value: moneyCompact(data!.largest_order_cents),  sub: "Single order",  emoji: "🏆", bg: "from-amber-50 to-white",   border: "border-amber-200",   color: "text-amber-700"   },
          ].map((stat) => (
            <div key={stat.label} className={`glass glass-ring rounded-[24px] p-4 bg-gradient-to-br ${stat.bg} border ${stat.border}`}>
              <div className="text-xl mb-2">{stat.emoji}</div>
              <div className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${stat.color}`}>{stat.label}</div>
              <div className="text-xl font-bold text-slate-900 leading-none mb-1">{stat.value}</div>
              <div className="text-[10px] text-slate-400">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Monthly Spend Chart */}
        <div className="glass glass-ring rounded-[28px] p-5 md:p-6 bg-white">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Monthly Spend</h3>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-slate-900">{moneyCompact(data!.this_month_cents)}</span>
                <span className="text-xs text-slate-400">this month</span>
              </div>
            </div>
            {mom !== null && (
              <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                mom >= 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-rose-50 text-rose-700 border-rose-200"
              }`}>
                {mom >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {mom >= 0 ? "+" : ""}{mom}% vs last month
              </div>
            )}
          </div>
          {data!.monthly.some((m) => m.total_cents > 0) ? (
            <BarChart data={data!.monthly} />
          ) : (
            <div className="h-24 flex items-center justify-center">
              <p className="text-sm text-slate-400">No spend data yet</p>
            </div>
          )}
        </div>

        {/* Credit + Order Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Credit Utilization */}
          <div className="glass glass-ring rounded-[28px] p-5 md:p-6 bg-white">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">💳</span>
              <h3 className="text-sm font-bold text-slate-900">Credit Utilization</h3>
            </div>
            {creditUtil !== null ? (
              <>
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <div className={`text-3xl font-bold leading-none ${creditUtil > 80 ? "text-rose-600" : "text-slate-900"}`}>
                      {creditUtil}%
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {money(profile?.business_credit_used_cents)} used
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-emerald-700">
                      {money((profile?.business_credit_limit_cents ?? 0) - (profile?.business_credit_used_cents ?? 0))}
                    </div>
                    <div className="text-xs text-slate-400">available</div>
                  </div>
                </div>
                <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden mb-4">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${creditUtil > 80 ? "bg-rose-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min(creditUtil, 100)}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Limit",  value: money(profile?.business_credit_limit_cents) },
                    { label: "Terms",  value: profile?.business_payment_terms === "net_60" ? "Net-60" : "Net-30" },
                  ].map((r) => (
                    <div key={r.label} className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 mb-0.5">{r.label}</div>
                      <div className="text-sm font-bold text-slate-900">{r.value}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-24 gap-2">
                <span className="text-2xl">—</span>
                <p className="text-xs text-slate-400">No credit limit set</p>
              </div>
            )}
          </div>

          {/* Order Status Breakdown */}
          <div className="glass glass-ring rounded-[28px] p-5 md:p-6 bg-white">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">📋</span>
              <h3 className="text-sm font-bold text-slate-900">Order Breakdown</h3>
            </div>
            {data!.status_breakdown.length > 0 ? (
              <div className="space-y-3">
                {data!.status_breakdown.map((s) => {
                  const p = pct(s.count, data!.total_orders);
                  const pillColor =
                    s.status === "completed" || s.status === "paid" ? "bg-emerald-50 text-emerald-700" :
                    s.status === "cancelled" ? "bg-rose-50 text-rose-700" :
                    s.status === "pending" ? "bg-amber-50 text-amber-700" :
                    s.status === "processing" ? "bg-sky-50 text-sky-700" : "bg-slate-50 text-slate-600";
                  return (
                    <div key={s.status}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${pillColor}`}>
                          {statusLabel(s.status)}
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          {s.count} <span className="text-slate-400 font-normal">({p}%)</span>
                        </span>
                      </div>
                      <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${p}%`, background: statusColor(s.status) }}
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 text-right">{moneyCompact(s.total_cents)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-24 gap-2">
                <span className="text-2xl">🛒</span>
                <p className="text-xs text-slate-400">No orders yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Top Products */}
        <div className="glass glass-ring rounded-[28px] p-5 md:p-6 bg-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏅</span>
              <h3 className="text-sm font-bold text-slate-900">Top Products by Spend</h3>
            </div>
            <span className="text-xs text-slate-400">All time</span>
          </div>
          {data!.top_items.length > 0 ? (
            <div className="space-y-3">
              {data!.top_items.map((item, i) => {
                const maxCents = data!.top_items[0].total_cents;
                const barWidth = pct(item.total_cents, maxCents);
                const rankColors = ["bg-amber-400 text-amber-900", "bg-slate-300 text-slate-700", "bg-orange-300 text-orange-900"];
                return (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className={`w-6 h-6 flex items-center justify-center text-[10px] font-black rounded-full flex-shrink-0 ${rankColors[i] ?? "bg-slate-100 text-slate-500"}`}>
                      {i + 1}
                    </span>
                    <div className="flex-shrink-0">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-9 h-9 rounded-xl object-cover border border-slate-100" />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-base border border-slate-100">
                          {item.emoji ?? "📦"}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-slate-900 truncate">{item.name}</span>
                        <span className="text-sm font-bold text-slate-900 ml-2 flex-shrink-0">{moneyCompact(item.total_cents)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${barWidth}%` }} />
                        </div>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          {item.total_quantity} unit{item.total_quantity !== 1 ? "s" : ""} · {pct(item.total_cents, data!.total_spent_cents)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Package className="w-6 h-6 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No order items yet</p>
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/invoices"
            className="glass glass-ring rounded-[24px] p-4 flex items-center gap-3 hover:shadow-md transition-shadow bg-gradient-to-br from-slate-800 to-slate-900"
          >
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">Invoices</div>
              <div className="text-[10px] text-white/60">View &amp; download</div>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-white/40 ml-auto" />
          </Link>

          <Link
            href="/business"
            className="glass glass-ring rounded-[24px] p-4 flex items-center gap-3 hover:shadow-md transition-shadow bg-gradient-to-br from-indigo-50 to-white border border-indigo-200"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-4 h-4 text-indigo-700" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">Dashboard</div>
              <div className="text-[10px] text-slate-400">Business overview</div>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-300 ml-auto" />
          </Link>
        </div>

      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS — MONTHLY DATA BUILDERS
══════════════════════════════════════════════════════════════════════════════ */

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short" });
}

function buildEmptyMonths(): MonthlySpend[] {
  const months: MonthlySpend[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      month: monthLabel(d),
      year: d.getFullYear(),
      total_cents: 0,
      order_count: 0,
    });
  }
  return months;
}

function buildMonthlySpend(orders: any[]): MonthlySpend[] {
  const months = buildEmptyMonths();
  const now = new Date();

  for (const order of orders) {
    const d = new Date(order.created_at);
    const diffMonths =
      (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());

    if (diffMonths < 0 || diffMonths > 5) continue;

    const idx = 5 - diffMonths;
    months[idx].total_cents += order.total_cents ?? 0;
    months[idx].order_count += 1;
  }

  return months;
}