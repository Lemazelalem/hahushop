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
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => {
        const h = Math.max(4, (d.total_cents / max) * 100);
        const isCurrentMonth = i === data.length - 1;

        return (
          <div
            key={`${d.month}-${d.year}`}
            className="flex-1 flex flex-col items-center gap-1 group relative"
          >
            {/* Tooltip */}
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              {moneyCompact(d.total_cents)}
              <br />
              <span className="text-gray-400 font-normal">
                {d.order_count} order{d.order_count !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Bar */}
            <div className="w-full flex-1 flex items-end">
              <div
                className={`w-full rounded-t transition-all duration-500 ${isCurrentMonth ? 'bg-green-600' : d.total_cents > 0 ? 'bg-gray-300' : 'bg-gray-100'}`}
                style={{ height: `${h}%` }}
              />
            </div>

            {/* Label */}
            <span className={`text-[9px] font-semibold ${isCurrentMonth ? 'text-green-700' : 'text-gray-400'}`}>
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center mx-auto mb-4 text-2xl">
            🔒
          </div>
          <h1 className="text-base font-bold text-gray-900 mb-2">
            Business Account Required
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Analytics are only available to approved business accounts.
          </p>
          <Link
            href="/business"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-xs text-white bg-gray-900 hover:bg-gray-800 transition-colors"
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center mx-auto mb-3">
            <BarChart3 className="w-5 h-5 text-gray-600" />
          </div>
          <div className="text-sm text-gray-500">
            Building your report…
          </div>
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
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => router.push("/business")}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gray-900 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900">
                  Spend Analytics
                </h1>
                <p className="text-xs text-gray-500">
                  {profile?.business_org_name ?? "Your Organization"} · All-time report
                </p>
              </div>
            </div>

            <Link
              href="/invoices"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 transition-colors"
            >
              View Invoices
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Spent", value: moneyCompact(data!.total_spent_cents), sub: "All time" },
            { label: "Total Orders", value: String(data!.total_orders), sub: "All time" },
            { label: "Avg. Order", value: moneyCompact(data!.avg_order_cents), sub: "Per order" },
            { label: "Largest Order", value: moneyCompact(data!.largest_order_cents), sub: "Single order" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-lg p-4 border border-gray-200">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                {stat.label}
              </div>
              <div className="text-base font-bold text-gray-900 leading-none mb-1">
                {stat.value}
              </div>
              <div className="text-[10px] text-gray-400">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Monthly Spend Chart */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Monthly Spend
              </div>
              <div className="text-sm font-bold text-gray-900">
                {moneyCompact(data!.this_month_cents)}
                <span className="text-xs font-normal text-gray-400 ml-2">this month</span>
              </div>
            </div>

            {mom !== null && (
              <div
                className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold ${
                  mom >= 0 
                    ? "bg-green-50 text-green-700 border border-green-200" 
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {mom >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {mom >= 0 ? "+" : ""}
                {mom}% vs last
              </div>
            )}
          </div>

          <div className="px-4 py-4">
            {data!.monthly.some((m) => m.total_cents > 0) ? (
              <BarChart data={data!.monthly} />
            ) : (
              <div className="h-24 flex items-center justify-center">
                <p className="text-xs text-gray-400">No spend data yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Credit Utilization */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Credit Utilization
            </div>

            {creditUtil !== null ? (
              <>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <div className="text-xl font-bold text-gray-900 leading-none">{creditUtil}%</div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {money(profile?.business_credit_used_cents)} of {money(profile?.business_credit_limit_cents)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-bold text-gray-900">
                      {money((profile?.business_credit_limit_cents ?? 0) - (profile?.business_credit_used_cents ?? 0))}
                    </div>
                    <div className="text-[10px] text-gray-500">available</div>
                  </div>
                </div>

                <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      creditUtil > 80 ? 'bg-red-500' : 'bg-green-600'
                    }`}
                    style={{ width: `${Math.min(creditUtil, 100)}%` }}
                  />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { label: "Limit", value: money(profile?.business_credit_limit_cents) },
                    { label: "Terms", value: profile?.business_payment_terms === "net_60" ? "Net-60" : "Net-30" },
                  ].map((r) => (
                    <div key={r.label} className="bg-gray-50 rounded p-2 border border-gray-100">
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
                        {r.label}
                      </div>
                      <div className="text-xs font-bold text-gray-900">{r.value}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-20">
                <p className="text-xs text-gray-400">No credit limit set</p>
              </div>
            )}
          </div>

          {/* Order Status Breakdown */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Order Breakdown
            </div>

            {data!.status_breakdown.length > 0 ? (
              <div className="space-y-2">
                {data!.status_breakdown.map((s) => (
                  <div key={s.status}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor(s.status) }} />
                        <span className="text-xs font-semibold text-gray-700">{statusLabel(s.status)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-gray-900">{s.count}</span>
                        <span className="text-[10px] text-gray-400 ml-1">({pct(s.count, data!.total_orders)}%)</span>
                      </div>
                    </div>
                    <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct(s.count, data!.total_orders)}%`,
                          background: statusColor(s.status),
                        }}
                      />
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5 text-right">
                      {moneyCompact(s.total_cents)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-20">
                <p className="text-xs text-gray-400">No orders yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Top Products by Spend
            </span>
            <span className="text-[10px] text-gray-400">All time</span>
          </div>

          {data!.top_items.length > 0 ? (
            <div>
              {data!.top_items.map((item, i) => {
                const barWidth = pct(item.total_cents, data!.top_items[0].total_cents);
                return (
                  <div
                    key={item.name}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors relative overflow-hidden"
                  >
                    {/* Background bar */}
                    <div
                      className="absolute inset-y-0 left-0 bg-green-50 opacity-50"
                      style={{ width: `${barWidth}%` }}
                    />

                    <span
                      className={`text-[10px] font-bold w-4 flex-shrink-0 text-center relative ${
                        i < 3 ? 'text-green-700' : 'text-gray-400'
                      }`}
                    >
                      {i + 1}
                    </span>

                    <div className="relative flex-shrink-0">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-8 h-8 rounded object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-sm border border-gray-200">
                          {item.emoji ?? "📦"}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 relative">
                      <div className="text-xs font-semibold text-gray-900 truncate">{item.name}</div>
                      <div className="text-[10px] text-gray-500">
                        {item.total_quantity} unit{item.total_quantity !== 1 ? "s" : ""}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 relative">
                      <div className="text-xs font-bold text-gray-900">{moneyCompact(item.total_cents)}</div>
                      <div className="text-[10px] text-gray-400">
                        {pct(item.total_cents, data!.total_spent_cents)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-8 text-center">
              <Package className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">No order items yet</p>
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/invoices"
            className="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3 hover:border-gray-300 transition-colors"
          >
            <div className="w-8 h-8 rounded bg-gray-900 flex items-center justify-center flex-shrink-0">
              <ShoppingBag className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-900">Invoices</div>
              <div className="text-[10px] text-gray-500">View & download</div>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-gray-400 ml-auto" />
          </Link>

          <Link
            href="/business"
            className="bg-white rounded-lg border border-gray-200 p-3 flex items-center gap-3 hover:border-gray-300 transition-colors"
          >
            <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-4 h-4 text-gray-600" />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-900">Dashboard</div>
              <div className="text-[10px] text-gray-500">Business overview</div>
            </div>
            <ArrowUpRight className="w-3.5 h-3.5 text-gray-400 ml-auto" />
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