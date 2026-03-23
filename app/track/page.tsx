// app/track/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  Package,
  PackageCheck,
  Search,
  ShoppingBag,
  Truck,
  XCircle,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════════════ */

type TrackingEvent = {
  id: string;
  status: string;
  message: string | null;
  location: string | null;
  created_at: string;
};

type OrderItem = {
  id: string;
  name_snapshot: string;
  emoji_snapshot: string | null;
  image_url_snapshot: string | null;
  quantity: number;
  line_total_cents: number;
};

type Order = {
  id: string;
  created_at: string;
  status: string;
  total_cents: number;
  shipping_full_name: string | null;
  shipping_city: string | null;
  shipping_woreda: string | null;
  shipping_region: string | null;
  estimated_delivery_date: string | null;
  delivered_at: string | null;
  tracking_note: string | null;
  items: OrderItem[];
  events: TrackingEvent[];
};

/* ══════════════════════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════════════════════ */

const TRACKING_STEPS = [
  { status: "pending", label: "Order Placed", icon: ShoppingBag },
  { status: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { status: "processing", label: "Processing", icon: Package },
  { status: "out_for_delivery", label: "Out for Delivery", icon: Truck },
  { status: "delivered", label: "Delivered", icon: PackageCheck },
];

const CANCELLED_STATUS = "cancelled";

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════════════ */

function money(cents: number): string {
  return `ETB ${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function currentStepIndex(status: string): number {
  const idx = TRACKING_STEPS.findIndex((s) => s.status === status);
  return idx >= 0 ? idx : 0;
}

function statusColor(status: string): string {
  if (status === "delivered" || status === "completed") return "#16a34a";
  if (status === "cancelled") return "#dc2626";
  if (status === "out_for_delivery") return "#2563eb";
  if (status === "processing") return "#7c3aed";
  if (status === "confirmed") return "#ca8a04";
  return "#64748b";
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "Order Placed",
    confirmed: "Confirmed",
    processing: "Processing",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    completed: "Delivered",
    cancelled: "Cancelled",
    paid: "Paid",
  };
  return map[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

/* ══════════════════════════════════════════════════════════════════════════════
   SIMPLE TRACKING STEPPER
══════════════════════════════════════════════════════════════════════════════ */

function TrackingStepper({ order }: { order: Order }) {
  const isCancelled = order.status === CANCELLED_STATUS;
  const currentIdx = isCancelled ? -1 : currentStepIndex(order.status);

  if (isCancelled) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-red-700">
              Order Cancelled
            </div>
            <div className="text-sm text-red-600 mt-1">
              {order.tracking_note ?? "This order has been cancelled."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="space-y-0">
        {TRACKING_STEPS.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const isLast = i === TRACKING_STEPS.length - 1;

          const stepEvents = order.events.filter((e) => e.status === step.status);

          return (
            <div key={step.status} className="relative flex gap-3">
              {!isLast && (
                <div
                  className="absolute left-[15px] top-8 bottom-0 w-px"
                  style={{
                    background:
                      done || active ? "#16a34a" : "#d1d5db",
                  }}
                />
              )}

              <div className="relative z-10 pt-0.5">
                {done ? (
                  <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                ) : active ? (
                  <div className="w-8 h-8 rounded-full border-2 border-green-600 bg-white flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-600" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full border border-slate-300 bg-white" />
                )}
              </div>

              <div className={`flex-1 pb-6 ${isLast ? "pb-0" : ""}`}>
                <div
                  className={`text-sm ${
                    done || active
                      ? "text-slate-900 font-semibold"
                      : "text-slate-400 font-medium"
                  }`}
                >
                  {step.label}
                </div>

                {stepEvents.map((e) => (
                  <div key={e.id} className="mt-1.5 space-y-1">
                    {e.message && (
                      <div className="text-sm text-slate-600">{e.message}</div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      {e.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {e.location}
                        </span>
                      )}
                      <span>{formatDateTime(e.created_at)}</span>
                    </div>
                  </div>
                ))}

                {step.status === "out_for_delivery" &&
                  active &&
                  order.estimated_delivery_date && (
                    <div className="mt-2 text-sm text-green-700 font-medium">
                      Estimated delivery: {formatDate(order.estimated_delivery_date)}
                    </div>
                  )}

                {step.status === "delivered" && done && order.delivered_at && (
                  <div className="mt-2 text-sm text-slate-500">
                    Delivered on {formatDateTime(order.delivered_at)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   ORDER CARD
══════════════════════════════════════════════════════════════════════════════ */

function OrderCard({
  order,
  expanded,
  onToggle,
}: {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = statusColor(order.status);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-4 flex items-start gap-3 hover:bg-slate-50 transition-colors"
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}12` }}
        >
          <Package className="w-4 h-4" style={{ color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">
              Order #{shortId(order.id)}
            </span>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-medium"
              style={{
                background: `${color}12`,
                color,
              }}
            >
              {statusLabel(order.status)}
            </span>
          </div>

          <div className="mt-1 text-sm text-slate-500">
            {formatDate(order.created_at)} · {order.items.length} item
            {order.items.length !== 1 ? "s" : ""} · {money(order.total_cents)}
          </div>
        </div>

        <div className="text-sm text-slate-500 flex-shrink-0">
          {expanded ? "Hide" : "Track"}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          <TrackingStepper order={order} />

          {(order.shipping_full_name || order.shipping_city) && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-slate-500 mb-2">
                Delivery address
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-slate-700">
                  {[
                    order.shipping_full_name,
                    order.shipping_woreda,
                    order.shipping_city,
                    order.shipping_region,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500">
              Items
            </div>

            <div className="divide-y divide-slate-100">
              {order.items.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-center gap-3">
                  {item.image_url_snapshot ? (
                    <img
                      src={item.image_url_snapshot}
                      alt={item.name_snapshot}
                      className="w-10 h-10 rounded-lg object-cover border border-slate-200 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-lg flex-shrink-0">
                      {item.emoji_snapshot ?? "📦"}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">
                      {item.name_snapshot}
                    </div>
                    <div className="text-xs text-slate-400">
                      Qty: {item.quantity}
                    </div>
                  </div>

                  <div className="text-sm font-semibold text-slate-900">
                    {money(item.line_total_cents)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {order.events.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500">
                Tracking history
              </div>

              <div className="divide-y divide-slate-100">
                {order.events.map((event) => (
                  <div key={event.id} className="px-4 py-3 flex items-start gap-3">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: statusColor(event.status) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700">
                        {statusLabel(event.status)}
                      </div>

                      {event.message && (
                        <div className="text-sm text-slate-500 mt-1">
                          {event.message}
                        </div>
                      )}

                      {event.location && (
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" />
                          {event.location}
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 whitespace-nowrap">
                      {formatDateTime(event.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════════ */

export default function TrackPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/auth/login?redirect=/track");
          return;
        }

        const { data: ordersData, error: ordersError } = await supabase
          .from("orders")
          .select(
            "id, created_at, status, total_cents, shipping_full_name, shipping_city, shipping_woreda, shipping_region, estimated_delivery_date, delivered_at, tracking_note"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (!alive) return;
        if (ordersError) throw ordersError;

        if (!ordersData?.length) {
          setOrders([]);
          setLoading(false);
          return;
        }

        const orderIds = ordersData.map((o: any) => o.id);

        const [itemsRes, eventsRes] = await Promise.all([
          supabase
            .from("order_items")
            .select(
              "id, order_id, name_snapshot, emoji_snapshot, image_url_snapshot, quantity, line_total_cents"
            )
            .in("order_id", orderIds),
          supabase
            .from("order_tracking_events")
            .select("id, order_id, status, message, location, created_at")
            .in("order_id", orderIds)
            .order("created_at", { ascending: false }),
        ]);

        if (!alive) return;

        const itemsByOrder: Record<string, OrderItem[]> = {};
        for (const item of itemsRes.data ?? []) {
          if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
          itemsByOrder[item.order_id].push({
            id: item.id,
            name_snapshot: item.name_snapshot ?? "Product",
            emoji_snapshot: item.emoji_snapshot ?? null,
            image_url_snapshot: item.image_url_snapshot ?? null,
            quantity: item.quantity ?? 1,
            line_total_cents: item.line_total_cents ?? 0,
          });
        }

        const eventsByOrder: Record<string, TrackingEvent[]> = {};
        for (const ev of eventsRes.data ?? []) {
          if (!eventsByOrder[ev.order_id]) eventsByOrder[ev.order_id] = [];
          eventsByOrder[ev.order_id].push({
            id: ev.id,
            status: ev.status,
            message: ev.message ?? null,
            location: ev.location ?? null,
            created_at: ev.created_at,
          });
        }

        const built: Order[] = ordersData.map((o: any) => ({
          id: o.id,
          created_at: o.created_at,
          status: o.status,
          total_cents: o.total_cents ?? 0,
          shipping_full_name: o.shipping_full_name ?? null,
          shipping_city: o.shipping_city ?? null,
          shipping_woreda: o.shipping_woreda ?? null,
          shipping_region: o.shipping_region ?? null,
          estimated_delivery_date: o.estimated_delivery_date ?? null,
          delivered_at: o.delivered_at ?? null,
          tracking_note: o.tracking_note ?? null,
          items: itemsByOrder[o.id] ?? [],
          events: eventsByOrder[o.id] ?? [],
        }));

        if (alive) {
          setOrders(built);
          const first = built.find(
            (o) => o.status !== "delivered" && o.status !== "cancelled"
          );
          if (first) setExpandedId(first.id);
          setLoading(false);
        }
      } catch (err) {
        console.error("[track] load error:", err);
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [router]);

  const filtered = orders.filter((o) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      shortId(o.id).toLowerCase().includes(q) ||
      o.status.toLowerCase().includes(q) ||
      formatDate(o.created_at).toLowerCase().includes(q) ||
      o.items.some((i) => i.name_snapshot.toLowerCase().includes(q))
    );
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm font-medium text-slate-500">
            Loading your orders...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <button
            onClick={() => router.push("/my-orders")}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            My Orders
          </button>

          <h1 className="text-2xl font-semibold text-slate-900">Track Orders</h1>
          <p className="text-sm text-slate-500 mt-1">
            {orders.length} order{orders.length !== 1 ? "s" : ""} total
          </p>
        </div>

        {orders.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by order ID, item name, or status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500"
            />
          </div>
        )}

        {orders.length === 0 ? (
          <div className="bg-white rounded-xl p-10 border border-slate-200 text-center">
            <p className="text-base font-semibold text-slate-700 mb-1">
              No orders yet
            </p>
            <p className="text-sm text-slate-400 mb-5">
              Your orders will appear here once you place one.
            </p>
            <Link
              href="/shop"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium"
            >
              Start Shopping
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl p-10 border border-slate-200 text-center">
            <p className="text-base font-semibold text-slate-700 mb-1">
              No orders match
            </p>
            <button
              onClick={() => setSearch("")}
              className="mt-3 px-5 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                expanded={expandedId === order.id}
                onToggle={() =>
                  setExpandedId(expandedId === order.id ? null : order.id)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}