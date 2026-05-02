"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ArrowLeft, Users, TrendingUp } from "lucide-react";

type RoleCounts = {
  customer: number;
  public_employee: number;
  seller: number;
  admin: number;
  business: number;
  other: number;
};

type DailyEntry = { date: string; label: string; count: number };
type MonthlyEntry = { month: string; label: string; count: number };

type Stats = {
  total: number;
  roleCounts: RoleCounts;
  daily: DailyEntry[];
  monthly: MonthlyEntry[];
};

const ROLE_CONFIG: {
  key: keyof RoleCounts;
  label: string;
  emoji: string;
  color: string;
  bg: string;
  border: string;
}[] = [
  { key: "customer",        label: "Customers",        emoji: "🛍️",  color: "text-indigo-700",  bg: "from-indigo-50 to-white",   border: "border-indigo-200" },
  { key: "public_employee", label: "Public Employees", emoji: "🏛️",  color: "text-sky-700",     bg: "from-sky-50 to-white",      border: "border-sky-200"    },
  { key: "seller",          label: "Sellers",          emoji: "🏪",  color: "text-emerald-700", bg: "from-emerald-50 to-white",  border: "border-emerald-200"},
  { key: "business",        label: "Businesses",       emoji: "💼",  color: "text-amber-700",   bg: "from-amber-50 to-white",    border: "border-amber-200"  },
  { key: "admin",           label: "Admins",           emoji: "🔑",  color: "text-rose-700",    bg: "from-rose-50 to-white",     border: "border-rose-200"   },
];

type Period = "30d" | "12m";

export default function CustomerDataPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [period, setPeriod] = useState<Period>("30d");

  // Auth check
  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user;
        if (!user) { router.replace("/auth/login"); return; }
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        if (!alive) return;
        if (!data || data.role !== "admin") { router.replace("/"); return; }
        setIsAdmin(true);
      } finally {
        if (alive) setChecking(false);
      }
    }
    check();
    return () => { alive = false; };
  }, [router]);

  // Load stats
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/customer-stats");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        if (data.error) throw new Error(data.error);
        setStats(data);
      } catch (err: unknown) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [isAdmin]);

  if (checking) return null;

  const chartData = stats ? (period === "30d" ? stats.daily : stats.monthly) : [];
  const maxCount = Math.max(...chartData.map((d) => d.count), 1);

  // For 30d chart, show every 5th label to avoid crowding
  const showLabel = (i: number) =>
    period === "12m" || i === 0 || i === chartData.length - 1 || (i + 1) % 5 === 0;

  // New users this month / this week
  const newThisMonth = stats?.monthly[stats.monthly.length - 1]?.count ?? 0;
  const newLast7 = stats?.daily.slice(-7).reduce((s, d) => s + d.count, 0) ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin")}
            className="pill px-3 py-2 text-sm font-semibold flex items-center gap-1.5"
          >
            <ArrowLeft size={15} />
            Admin
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Users size={22} className="text-indigo-600" />
              Customer Data
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">All registered accounts by type</p>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="glass glass-ring rounded-[28px] p-5 animate-pulse bg-slate-100 h-28" />
            ))}
          </div>
        ) : stats && (
          <>
            {/* Total + growth summary */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="glass glass-ring rounded-[28px] p-5 bg-gradient-to-br from-violet-50 to-white border-violet-200 col-span-2 md:col-span-1">
                <div className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-1">
                  Total Accounts
                </div>
                <div className="text-3xl font-bold text-slate-900">{stats.total.toLocaleString()}</div>
                <div className="text-xs text-slate-500 mt-1">All time</div>
              </div>

              <div className="glass glass-ring rounded-[28px] p-5 bg-gradient-to-br from-teal-50 to-white border-teal-200">
                <div className="text-xs font-semibold text-teal-600 uppercase tracking-wide mb-1">
                  New This Month
                </div>
                <div className="text-3xl font-bold text-slate-900">{newThisMonth.toLocaleString()}</div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <TrendingUp size={11} /> joined in {new Date().toLocaleString("en-US", { month: "long" })}
                </div>
              </div>

              <div className="glass glass-ring rounded-[28px] p-5 bg-gradient-to-br from-fuchsia-50 to-white border-fuchsia-200">
                <div className="text-xs font-semibold text-fuchsia-600 uppercase tracking-wide mb-1">
                  New Last 7 Days
                </div>
                <div className="text-3xl font-bold text-slate-900">{newLast7.toLocaleString()}</div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <TrendingUp size={11} /> this week
                </div>
              </div>
            </div>

            {/* Role breakdown cards */}
            <div>
              <h2 className="text-base font-bold text-slate-700 mb-3">By Account Type</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {ROLE_CONFIG.map(({ key, label, emoji, color, bg, border }) => (
                  <div
                    key={key}
                    className={`glass glass-ring rounded-[24px] p-4 bg-gradient-to-br ${bg} border ${border}`}
                  >
                    <div className="text-2xl mb-2">{emoji}</div>
                    <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${color}`}>
                      {label}
                    </div>
                    <div className="text-2xl font-bold text-slate-900">
                      {(stats.roleCounts[key] ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {stats.total > 0
                        ? `${Math.round(((stats.roleCounts[key] ?? 0) / stats.total) * 100)}%`
                        : "—"}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Growth chart */}
            <div className="glass glass-ring rounded-[28px] p-5 md:p-6 bg-white">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-bold text-slate-900">New Accounts Over Time</h2>
                  <p className="text-xs text-slate-500 mt-0.5">How many accounts were created each {period === "30d" ? "day" : "month"}</p>
                </div>
                <div className="flex gap-2">
                  {(["30d", "12m"] as Period[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        period === p
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {p === "30d" ? "30 Days" : "12 Months"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bar chart */}
              <div className="flex items-end gap-1 h-40">
                {chartData.map((entry, i) => {
                  const height = maxCount > 0 ? (entry.count / maxCount) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div className="w-full relative flex items-end" style={{ height: "120px" }}>
                        <div
                          className="w-full rounded-t-sm bg-indigo-500 hover:bg-indigo-400 transition-colors"
                          style={{ height: `${Math.max(height, entry.count > 0 ? 4 : 0)}%` }}
                          title={`${entry.count} new`}
                        />
                      </div>
                      {showLabel(i) && (
                        <span className="text-[9px] text-slate-400 truncate w-full text-center leading-tight">
                          {entry.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Peak annotation */}
              {maxCount > 1 && (
                <p className="text-xs text-slate-400 mt-3 text-right">
                  Peak: {maxCount} new accounts in one {period === "30d" ? "day" : "month"}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
