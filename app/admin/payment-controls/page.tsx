// app/admin/payment-controls/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Truck,
  Smartphone,
  WalletCards,
  AlertCircle,
  CheckCircle2,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

type PaymentControl = {
  id: string;
  label: string;
  is_enabled: boolean;
  sort_order: number;
  updated_at: string;
};

function getIcon(id: string) {
  switch (id) {
    case "pay_on_delivery":
      return Truck;
    case "stripe_card":
      return CreditCard;
    case "telebirr":
    case "cbe_birr":
    case "apple_pay":
    case "google_pay":
      return Smartphone;
    case "paypal":
    case "ceb_link":
    default:
      return WalletCards;
  }
}

function getDescription(id: string): string {
  switch (id) {
    case "pay_on_delivery":
      return "Customer pays cash or card at delivery.";
    case "stripe_card":
      return "Credit/debit card via Stripe (Visa, Mastercard).";
    case "telebirr":
      return "Ethio telecom mobile wallet payment.";
    case "cbe_birr":
      return "Commercial Bank of Ethiopia mobile wallet.";
    case "paypal":
      return "PayPal balance or linked card.";
    case "apple_pay":
      return "Quick checkout from Apple devices.";
    case "google_pay":
      return "Saved cards via Google Pay.";
    case "ceb_link":
      return "CEB payment link sent by SMS / email.";
    default:
      return "";
  }
}

export default function AdminPaymentControlsPage() {
  const router = useRouter();
  const mountedRef = useRef(true);

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [methods, setMethods] = useState<PaymentControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Auth + role check ──────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        const { data: sess, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) {
          console.error("[payment-controls] session error:", sessionError);
          if (mountedRef.current) router.replace("/auth/login");
          return;
        }

        const user = sess.session?.user;
        if (!user) {
          if (mountedRef.current) router.replace("/auth/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (error || !data || data.role !== "admin") {
          if (mountedRef.current) router.replace("/");
          return;
        }

        if (alive && mountedRef.current) setIsAdmin(true);
      } finally {
        if (alive && mountedRef.current) setChecking(false);
      }
    }

    run();
    return () => { alive = false; };
  }, [router]);

  // ── Load payment methods ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    loadMethods();
  }, [isAdmin]);

  async function loadMethods() {
    if (!mountedRef.current) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/admin/payment-controls");
      if (!mountedRef.current) return;

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMsg(body.error ?? "Failed to load payment methods.");
        return;
      }

      const body = await res.json();
      if (mountedRef.current) setMethods(body.methods ?? []);
    } catch (err) {
      if (mountedRef.current) {
        console.error("[payment-controls] load error:", err);
        setErrorMsg("Failed to load payment methods.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  // ── Toggle a method ────────────────────────────────────────────────────────
  async function handleToggle(method: PaymentControl) {
    if (toggling) return;
    setToggling(method.id);
    setErrorMsg(null);
    setSuccessMsg(null);

    const newEnabled = !method.is_enabled;

    // Optimistic update
    setMethods((prev) =>
      prev.map((m) =>
        m.id === method.id ? { ...m, is_enabled: newEnabled } : m
      )
    );

    try {
      const res = await fetch("/api/admin/payment-controls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: method.id, is_enabled: newEnabled }),
      });

      if (!mountedRef.current) return;

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Rollback optimistic update
        setMethods((prev) =>
          prev.map((m) =>
            m.id === method.id ? { ...m, is_enabled: method.is_enabled } : m
          )
        );
        setErrorMsg(body.error ?? "Failed to update payment method.");
        return;
      }

      const body = await res.json();
      const updated: PaymentControl = body.method;

      if (mountedRef.current) {
        setMethods((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m))
        );
        setSuccessMsg(
          `${updated.label} has been ${updated.is_enabled ? "enabled" : "disabled"}.`
        );
        // Clear success message after 3 s
        setTimeout(() => {
          if (mountedRef.current) setSuccessMsg(null);
        }, 3000);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      console.error("[payment-controls] toggle error:", err);
      // Rollback
      setMethods((prev) =>
        prev.map((m) =>
          m.id === method.id ? { ...m, is_enabled: method.is_enabled } : m
        )
      );
      setErrorMsg("Unexpected error while updating payment method.");
    } finally {
      if (mountedRef.current) setToggling(null);
    }
  }

  // ── Guards ─────────────────────────────────────────────────────────────────
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

  const enabledCount = methods.filter((m) => m.is_enabled).length;
  const totalCount = methods.length;

  return (
    <main className="py-4 md:py-6 space-y-6">
      {/* Header */}
      <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Admin · Settings
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mt-1">
              Payment Controls
            </h1>
            <p className="text-sm md:text-base text-slate-600 mt-1 max-w-xl">
              Enable or disable payment methods for customers in real time.
              Changes take effect immediately — no redeployment required.
              Existing orders are never affected.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {!loading && (
              <div className="text-center">
                <div className="text-2xl font-black text-slate-900">
                  {enabledCount}/{totalCount}
                </div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  Methods active
                </div>
              </div>
            )}
            <button
              onClick={loadMethods}
              disabled={loading}
              className="p-2.5 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                className={`w-4 h-4 text-slate-600 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        <button
          onClick={() => router.push("/admin")}
          className="mt-5 pill px-5 py-2 text-sm font-semibold"
        >
          ← Back to Dashboard
        </button>
      </section>

      {/* Status messages */}
      {errorMsg && (
        <div className="glass glass-ring rounded-[20px] px-5 py-4 flex items-center gap-3 border border-rose-200 bg-rose-50">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <p className="text-sm text-rose-700 font-medium">{errorMsg}</p>
        </div>
      )}
      {successMsg && (
        <div className="glass glass-ring rounded-[20px] px-5 py-4 flex items-center gap-3 border border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-700 font-medium">{successMsg}</p>
        </div>
      )}

      {/* Payment method list */}
      <section className="glass glass-ring rounded-[28px] overflow-hidden">
        {/* Section header */}
        <div className="px-6 py-4 border-b border-slate-200/60 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Payment Methods</h2>
          <span className="text-xs text-slate-500 font-medium">
            Toggle to enable / disable for customers
          </span>
        </div>

        {loading ? (
          <div className="divide-y divide-slate-100">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 px-6 py-5 animate-pulse"
              >
                <div className="w-11 h-11 rounded-2xl bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-slate-200 rounded" />
                  <div className="h-3 w-64 bg-slate-100 rounded" />
                </div>
                <div className="w-14 h-7 bg-slate-200 rounded-full" />
              </div>
            ))}
          </div>
        ) : methods.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            No payment methods found. Run the database migration to seed them.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {methods.map((method) => {
              const Icon = getIcon(method.id);
              const isToggling = toggling === method.id;

              return (
                <div
                  key={method.id}
                  className="flex items-center gap-4 px-6 py-5 transition-colors hover:bg-slate-50/60"
                >
                  {/* Icon */}
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                      method.is_enabled ? "bg-emerald-50" : "bg-slate-100"
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 transition-colors ${
                        method.is_enabled
                          ? "text-emerald-600"
                          : "text-slate-400"
                      }`}
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-900">
                        {method.label}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${
                          method.is_enabled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {method.is_enabled ? "ENABLED" : "DISABLED"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {getDescription(method.id)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">
                      ID: {method.id}
                    </p>
                  </div>

                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggle(method)}
                    disabled={isToggling || !!toggling}
                    aria-label={`${method.is_enabled ? "Disable" : "Enable"} ${method.label}`}
                    className={`shrink-0 flex items-center transition-opacity ${
                      isToggling || toggling ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                    }`}
                  >
                    {method.is_enabled ? (
                      <ToggleRight className="w-10 h-10 text-emerald-500" />
                    ) : (
                      <ToggleLeft className="w-10 h-10 text-slate-400" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Info note */}
      <section className="glass glass-ring rounded-[20px] px-5 py-4">
        <h3 className="text-sm font-bold text-slate-800 mb-2">How it works</h3>
        <ul className="space-y-1.5 text-xs text-slate-600">
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold mt-0.5">✓</span>
            Changes take effect immediately — no rebuild or redeploy needed.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold mt-0.5">✓</span>
            Disabled methods are hidden on the checkout page. Customers cannot
            select them.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold mt-0.5">✓</span>
            Existing orders with a disabled method are unaffected — they keep
            their original payment method in the order record.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold mt-0.5">✓</span>
            Re-enable any method at any time.
          </li>
        </ul>
      </section>
    </main>
  );
}
