// app/seller/payouts/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Bell } from "lucide-react";

type PayoutStatus = "pending" | "paid" | "cancelled" | string;

type PayoutRow = {
  id: string;
  seller_id: string;
  status: PayoutStatus;
  calculated_amount_cents: number | null;
  adjusted_amount_cents: number | null;
  period_start: string | null;
  period_end: string | null;
  paid_at: string | null;
  admin_notes: string | null;
  created_at: string | null;
};

function formatMoney(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const statusConfig: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  pending: {
    label: "Pending",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
  },
  paid: {
    label: "Paid",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
  },
  cancelled: {
    label: "Cancelled",
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200",
  },
};

export default function SellerPayoutsPage() {
  const router = useRouter();
  const mountedRef = useRef(true);

  const [checking, setChecking] = useState(true);
  const [isSeller, setIsSeller] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [payouts, setPayouts] = useState<PayoutRow[]>([]);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ------------------------------
  // AUTH + ROLE CHECK (seller only)
  // ------------------------------
  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        const { data: sess, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) {
          console.error("[seller payouts] session error:", sessionError);
          if (mountedRef.current) router.replace("/login");
          return;
        }

        const user = sess.session?.user;
        if (!user) {
          if (mountedRef.current) router.replace("/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (error) {
          console.error("[seller payouts] profile fetch error:", error);
          if (mountedRef.current) router.replace("/");
          return;
        }

        if (!data || data.role !== "seller") {
          if (mountedRef.current) router.replace("/");
          return;
        }

        if (alive && mountedRef.current) {
          setIsSeller(true);
        }
      } finally {
        if (alive && mountedRef.current) {
          setChecking(false);
        }
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [router]);

  // ------------------------------
  // LOAD SELLER'S OWN PAYOUTS
  // ------------------------------
  useEffect(() => {
    if (!isSeller) return;

    let alive = true;

    async function load() {
      if (mountedRef.current) {
        setLoading(true);
        setErrorMsg(null);
      }

      try {
        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user;
        if (!user) {
          if (mountedRef.current) router.replace("/login");
          return;
        }

        const { data, error } = await supabase
          .from("seller_payouts")
          .select(
            "id, seller_id, status, calculated_amount_cents, adjusted_amount_cents, period_start, period_end, paid_at, admin_notes, created_at"
          )
          .eq("seller_id", user.id)
          .order("created_at", { ascending: false });

        if (!alive || !mountedRef.current) return;

        if (error) {
          console.error("[seller payouts] query error:", error);
          if (mountedRef.current) {
            setErrorMsg("Failed to load payouts.");
            setPayouts([]);
          }
        } else if (mountedRef.current) {
          setPayouts((data ?? []) as PayoutRow[]);
          setErrorMsg(null);
        }
      } catch (e) {
        if (!alive || !mountedRef.current) return;
        console.error("[seller payouts] unexpected error:", e);
        setErrorMsg("Failed to load payouts.");
      } finally {
        if (alive && mountedRef.current) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [isSeller, router]);

  // ------------------------------
  // AGGREGATED TOTALS
  // ------------------------------
  const totals = useMemo(() => {
    let totalRecorded = 0;
    let totalPaid = 0;

    for (const p of payouts) {
      const amount =
        p.adjusted_amount_cents ?? p.calculated_amount_cents ?? 0;
      if (!amount || amount <= 0) continue;

      totalRecorded += amount;
      if ((p.status || "").toLowerCase() === "paid") {
        totalPaid += amount;
      }
    }

    const pending = totalRecorded - totalPaid;
    return {
      totalRecordedCents: totalRecorded,
      totalPaidCents: totalPaid,
      totalPendingCents: pending > 0 ? pending : 0,
    };
  }, [payouts]);

  // ------------------------------
  // LOADING / GUARD
  // ------------------------------
  if (checking) {
    return (
      <main className="py-4 md:py-6">
        <div className="glass glass-ring rounded-[28px] p-6 text-sm text-slate-700">
          Checking seller access…
        </div>
      </main>
    );
  }

  if (!isSeller) {
    return null;
  }

  // ------------------------------
  // MAIN UI
  // ------------------------------
  return (
    <main className="py-4 md:py-6 space-y-6">
      {/* HEADER CARD */}
      <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
              Seller
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mt-1">
              My Payouts
            </h1>
            <p className="text-sm md:text-base text-slate-700 mt-1">
              Track payouts from HahuShop admin: pending amounts and paid
              history.
            </p>
          </div>

          <button
            onClick={() => router.push("/seller")}
            className="pill px-5 py-2 text-sm font-semibold text-slate-900"
          >
            ← Back to Seller Home
          </button>
        </div>

        {/* High-level stats */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass glass-ring rounded-[24px] p-4">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Pending Payout
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-bold text-amber-900">
              {formatMoney(totals.totalPendingCents)}
            </div>
            <div className="mt-1 text-[11px] text-amber-700">
              Amount admin still has to send
            </div>
          </div>

          <div className="glass glass-ring rounded-[24px] p-4">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Paid to Me
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-bold text-emerald-900">
              {formatMoney(totals.totalPaidCents)}
            </div>
            <div className="mt-1 text-[11px] text-emerald-700">
              Sum of all completed payouts
            </div>
          </div>

          <div className="glass glass-ring rounded-[24px] p-4">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Total Recorded
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-bold text-slate-900">
              {formatMoney(totals.totalRecordedCents)}
            </div>
            <div className="mt-1 text-[11px] text-slate-600">
              All payout amounts (pending + paid)
            </div>
          </div>
        </div>
      </section>

      {/* ERROR (if any) */}
      {errorMsg && (
        <section className="glass glass-ring rounded-[28px] p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200">
          {errorMsg}
        </section>
      )}

      {/* PAYOUT LIST */}
      <section className="glass glass-ring rounded-[28px] p-4 md:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <div className="text-sm font-bold text-slate-900">
              Payout History
            </div>
            <div className="text-[11px] text-slate-600">
              Each row is a payout record created by admin.
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-slate-700">Loading payouts…</div>
        ) : payouts.length === 0 ? (
          <div className="rounded-2xl bg-white/70 border border-white/80 px-4 py-8 text-center text-sm text-slate-600">
            No payouts recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {payouts.map((p) => {
              const amount =
                p.adjusted_amount_cents ?? p.calculated_amount_cents ?? 0;
              const statusKey = (p.status || "").toLowerCase();
              const cfg =
                statusConfig[statusKey] ??
                ({
                  label: p.status || "Unknown",
                  bg: "bg-slate-50",
                  text: "text-slate-800",
                  border: "border-slate-200",
                } as const);

              return (
                <div
                  key={p.id}
                  className="glass glass-ring rounded-[24px] p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-slate-600 bg-white/70 border border-white/80 px-2 py-1 rounded-full">
                        #{p.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-1 rounded-full text-[10px] font-semibold border",
                          cfg.bg,
                          cfg.text,
                          cfg.border
                        )}
                      >
                        {cfg.label}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Created {formatDateTime(p.created_at)}
                      </span>
                    </div>

                    <div className="text-xs text-slate-700">
                      Period:{" "}
                      <span className="font-semibold text-slate-900">
                        {formatDate(p.period_start)} –{" "}
                        {formatDate(p.period_end)}
                      </span>
                    </div>

                    {p.paid_at && (
                      <div className="text-xs text-emerald-700">
                        Paid at:{" "}
                        <span className="font-semibold">
                          {formatDateTime(p.paid_at)}
                        </span>
                      </div>
                    )}

                    {p.admin_notes && (
                      <div className="mt-1 text-[11px] text-slate-600">
                        Admin notes:{" "}
                        <span className="font-semibold">
                          {p.admin_notes}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="w-full md:w-[200px] text-right">
                    <div className="text-[11px] text-slate-600">
                      Payout amount
                    </div>
                    <div className="text-xl font-bold text-slate-900">
                      {formatMoney(amount)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}