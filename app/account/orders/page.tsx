// app/account/orders/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { CART_KEY, parseCart, serialiseCart } from "@/lib/cart";

type OrderStatus = string;

type SnapshotItem = {
  // Optional product id if your snapshot stores it
  product_id?: string | null;
  name: string;
  emoji?: string;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
};

type OrderRow = {
  id: string;
  created_at: string;
  status: OrderStatus;
  subtotal_cents: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  cart_snapshot: {
    items?: SnapshotItem[];
  } | null;
};

function money(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AccountOrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setPageError(null);
      setAuthorized(false);

      // 1) Who is logged in?
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData?.user;

      if (userError || !user) {
        setPageError("You need to sign in to see your orders.");
        setLoading(false);
        return;
      }

      setAuthorized(true);

      // 2) Load orders for this user
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, created_at, status, subtotal_cents, tax_cents, total_cents, cart_snapshot"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setPageError(error.message || "Could not load your orders.");
        setLoading(false);
        return;
      }

      setOrders((data || []) as OrderRow[]);
      setLoading(false);
    }

    load();
  }, []);

  const summary = useMemo(() => {
    const count = orders.length;
    const totalSpent =
      orders.reduce(
        (acc, o) => acc + (o.total_cents || 0),
        0
      ) / 100;
    return {
      count,
      totalSpent: totalSpent.toFixed(2),
    };
  }, [orders]);

  function toggleExpanded(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function normalizedStatus(status: OrderStatus) {
    return (status || "").toLowerCase();
  }

  function statusBadgeClass(status: OrderStatus) {
    const base =
      "inline-flex items-center rounded-full px-3 py-1 text-[11px] md:text-xs font-semibold uppercase tracking-wide";
    const s = normalizedStatus(status);

    if (s === "paid" || s === "completed") {
      return `${base} bg-emerald-100 text-emerald-700`;
    }
    if (s === "pending") {
      return `${base} bg-amber-100 text-amber-700`;
    }
    if (s === "cancelled" || s === "canceled" || s === "cancelled_by_user") {
      return `${base} bg-rose-100 text-rose-700`;
    }
    return `${base} bg-slate-100 text-slate-700`;
  }

  const canCancel = (o: OrderRow) => normalizedStatus(o.status) === "pending";

  async function handleCancel(order: OrderRow) {
    if (!canCancel(order)) return;

    const ok = window.confirm(
      "Cancel this order? In a real shop this would stop fulfillment."
    );
    if (!ok) return;

    try {
      setCancellingId(order.id);
      setPageError(null);

      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled_by_user" })
        .eq("id", order.id);

      if (error) {
        console.error(error);
        setPageError(error.message || "Could not cancel the order.");
        return;
      }

      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id ? { ...o, status: "cancelled_by_user" } : o
        )
      );
    } finally {
      setCancellingId(null);
    }
  }

  function handleReorder(order: OrderRow) {
    const snapshot = (order.cart_snapshot || {}) as { items?: SnapshotItem[] };
    const snapshotItems = Array.isArray(snapshot.items) ? snapshot.items : [];

    if (!snapshotItems.length) {
      alert(
        "This order doesn’t have item details saved, so it can’t be re-ordered."
      );
      return;
    }

    try {
      setReorderingId(order.id);

      const raw = window.localStorage.getItem(CART_KEY);
      const existingItems: any[] = parseCart(raw) as any[];

      snapshotItems.forEach((item) => {
        // Try to reuse product_id if present; otherwise make a stable-ish id
        const baseId =
          item.product_id ||
          `reorder-${order.id}-${item.name}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        existingItems.push({
          kind: item.product_id ? "approved" : "demo",
          id: baseId,
          quantity: Math.max(1, Number(item.qty) || 1),
        });
      });

      window.localStorage.setItem(CART_KEY, serialiseCart(existingItems));

      // Go straight to checkout so user can confirm / edit
      router.push("/checkout");
    } finally {
      // Not super important because we navigate away, but keeps state clean
      setReorderingId(null);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-10">
      {/* background layers */}
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      <div className="mx-auto max-w-5xl">
        {/* HEADER CARD */}
        <div className="glass glass-card glow-blue rounded-[28px] glass-ring p-6 md:p-8 mt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs md:text-sm font-semibold tracking-wide text-slate-600 uppercase">
                My account
              </div>
              <h1 className="mt-1 text-4xl md:text-5xl font-semibold text-slate-900">
                My orders
              </h1>
              <p className="mt-3 text-sm md:text-base text-slate-700 max-w-2xl leading-relaxed">
                View the demo orders you&apos;ve placed through the HahuShop
                checkout. This is a preview of what your real customer account
                page could look like.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="pill px-4 py-2 text-xs md:text-sm font-semibold text-slate-900"
              >
                ← Home
              </button>
              <div className="rounded-full bg-white/90 border border-white/90 px-4 py-2 text-[11px] md:text-xs font-medium text-slate-800 shadow-sm text-right">
                <div>
                  Orders: <span className="font-semibold">{summary.count}</span>
                </div>
                <div>
                  Total spent:{" "}
                  <span className="font-semibold">${summary.totalSpent}</span>
                </div>
              </div>
            </div>
          </div>

          {pageError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-xs md:text-sm text-red-700">
              {pageError}
              {!authorized && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => router.push("/auth/login")}
                    className="rounded-full bg-slate-900/90 px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-slate-900/40"
                  >
                    Go to login →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ORDERS LIST */}
        <div className="mt-6 glass glass-card rounded-[24px] glass-ring p-5 md:p-6">
          {loading ? (
            <div className="text-sm md:text-base text-slate-700">
              Loading your orders…
            </div>
          ) : !orders.length ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm md:text-base text-slate-700">
              <div className="text-4xl mb-2">🧺</div>
              <div className="text-base md:text-lg font-semibold text-slate-900">
                No orders yet
              </div>
              <p className="mt-1 max-w-md text-sm md:text-base text-slate-700">
                Place a demo order from the{" "}
                <button
                  type="button"
                  onClick={() => router.push("/shop")}
                  className="underline font-semibold"
                >
                  Shop
                </button>{" "}
                page and it will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((o) => {
                const snapshot = (o.cart_snapshot || {}) as {
                  items?: SnapshotItem[];
                };
                const items = Array.isArray(snapshot.items) ? snapshot.items : [];
                const itemCount = items.reduce(
                  (acc, it) => acc + (Number(it.qty) || 0),
                  0
                );

                const created = new Date(o.created_at);
                const createdLabel = created.toLocaleString();

                const isExpanded = expandedId === o.id;
                const isCancelling = cancellingId === o.id;
                const hasItems = items.length > 0;
                const isReordering = reorderingId === o.id;
                const cancellable = canCancel(o);

                return (
                  <div
                    key={o.id}
                    className="rounded-2xl bg-white/75 border border-white/80 p-4 md:p-5 flex flex-col gap-3"
                  >
                    {/* Top row: basic info */}
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="text-base md:text-lg font-semibold text-slate-900">
                            Order #{o.id.slice(0, 8)}
                          </div>
                          <span className={statusBadgeClass(o.status || "pending")}>
                            {o.status || "pending"}
                          </span>
                        </div>
                        <div className="mt-1 text-xs md:text-sm text-slate-600">
                          Placed on {createdLabel}
                        </div>
                        <div className="mt-0.5 text-[11px] md:text-xs text-slate-500">
                          Items: <span className="font-semibold">{itemCount}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <div className="text-right text-sm md:text-base">
                          <div className="text-[11px] md:text-xs text-slate-500">
                            Subtotal: {money(o.subtotal_cents)}
                          </div>
                          <div className="text-[11px] md:text-xs text-slate-500">
                            Tax: {money(o.tax_cents)}
                          </div>
                          <div className="mt-1 text-sm md:text-base font-semibold text-slate-900">
                            Total: {money(o.total_cents)}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 justify-end">
                          {hasItems && (
                            <button
                              type="button"
                              onClick={() => handleReorder(o)}
                              disabled={isReordering}
                              className="rounded-full bg-emerald-500/90 px-4 py-1.5 text-[11px] md:text-xs font-semibold text-white shadow-md shadow-emerald-500/40 disabled:opacity-60"
                            >
                              {isReordering ? "Adding…" : "Re-order items"}
                            </button>
                          )}
                          {cancellable && (
                            <button
                              type="button"
                              onClick={() => handleCancel(o)}
                              disabled={isCancelling}
                              className="rounded-full bg-rose-500/90 px-4 py-1.5 text-[11px] md:text-xs font-semibold text-white shadow-md shadow-rose-500/40 disabled:opacity-60"
                            >
                              {isCancelling ? "Cancelling…" : "Cancel order"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Toggle + items */}
                    {hasItems && (
                      <div className="border-t border-slate-200/80 pt-3 mt-2">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(o.id)}
                          className="text-[11px] md:text-xs font-semibold text-slate-800 underline underline-offset-2"
                        >
                          {isExpanded ? "Hide items ▲" : "View items ▼"}
                        </button>

                        {isExpanded && (
                          <div className="mt-3 space-y-2">
                            {items.map((it, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between rounded-2xl bg-white/95 border border-slate-100 px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="h-9 w-9 md:h-10 md:w-10 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-lg">
                                    {it.emoji || "🛒"}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-slate-900 text-sm md:text-[15px]">
                                      {it.name}
                                    </div>
                                    <div className="text-[11px] md:text-xs text-slate-600">
                                      Qty: {it.qty} · {money(it.unit_price_cents)}{" "}
                                      / each
                                    </div>
                                  </div>
                                </div>
                                <div className="text-xs md:text-sm font-semibold text-slate-900">
                                  {money(it.line_total_cents)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-5 text-center text-[10px] md:text-[11px] text-slate-600">
          Customer view • This page is powered by the{" "}
          <code className="font-mono text-[10px]">orders</code> table and the
          snapshot saved at checkout. Pending orders can be cancelled, and any
          order with item details can be re-ordered into the current cart.
        </div>
      </div>
    </main>
  );
}
