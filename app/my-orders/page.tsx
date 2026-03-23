// app/my-orders/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { CART_KEY, type Cart } from "@/lib/cart";
import { getPaymentMethodLabel } from "@/lib/paymentMethods";
import {
  ArrowLeft, RefreshCw, ChevronDown, ChevronUp,
  MapPin, Calendar, X, RotateCcw, PackageOpen,
  ShoppingBag, CheckCircle2, Package, Truck, PackageCheck,
  Check, XCircle, Search, CreditCard,
} from "lucide-react";

/* ─── Types ─── */
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
  product_id?: string | null;
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
  payment_method: string | null;
  items: OrderItem[];
  events: TrackingEvent[];
};

/* ─── Constants ─── */
const TRACKING_STEPS = [
  { status: "pending",          label: "Order Placed",     icon: ShoppingBag   },
  { status: "confirmed",        label: "Confirmed",        icon: CheckCircle2  },
  { status: "processing",       label: "Processing",       icon: Package       },
  { status: "out_for_delivery", label: "Out for Delivery", icon: Truck         },
  { status: "delivered",        label: "Delivered",        icon: PackageCheck  },
];

const CANCEL_REASONS = [
  "Changed my mind",
  "Ordered by mistake",
  "Found a better price elsewhere",
  "Delivery time is too long",
  "Payment issue",
  "Other",
];

const RETURN_REASONS = [
  "Item arrived damaged",
  "Wrong item delivered",
  "Item not as described",
  "Changed my mind",
  "Quality not as expected",
  "Other",
];

/* ─── Helpers ─── */
function money(cents: number | null | undefined): string {
  if (!cents || cents <= 0) return "ETB 0.00";
  return `ETB ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function currentStepIndex(status: string): number {
  const s = status === "completed" ? "delivered" : status;
  const idx = TRACKING_STEPS.findIndex((t) => t.status === s);
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
    pending: "Order Placed", confirmed: "Confirmed", processing: "Processing",
    out_for_delivery: "Out for Delivery", delivered: "Delivered",
    completed: "Delivered", cancelled: "Cancelled", paid: "Paid",
  };
  return map[status] ?? status.charAt(0).toUpperCase() + status.slice(1);
}

function statusBg(status: string): string {
  if (status === "delivered" || status === "completed") return "#dcfce7";
  if (status === "cancelled") return "#fee2e2";
  if (status === "out_for_delivery") return "#dbeafe";
  if (status === "processing") return "#ede9fe";
  if (status === "confirmed") return "#fef9c3";
  return "#f1f5f9";
}

/* ─── Image with Fallback ─── */
function ProductImage({ 
  src, 
  emoji, 
  alt,
  size = 40 
}: { 
  src: string | null; 
  emoji: string | null; 
  alt: string;
  size?: number;
}) {
  const [error, setError] = useState(false);
  
  if (!src || error) {
    return (
      <div style={{ 
        width: size, 
        height: size, 
        borderRadius: size > 40 ? 12 : 10, 
        background: "#f8fafc", 
        border: "1px solid #f1f5f9", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        fontSize: size > 40 ? 24 : 18,
        flexShrink: 0 
      }}>
        {emoji || "📦"}
      </div>
    );
  }
  
  return (
    <img 
      src={src} 
      alt={alt}
      onError={() => setError(true)}
      style={{ 
        width: size, 
        height: size, 
        borderRadius: size > 40 ? 12 : 10, 
        objectFit: "cover",
        border: "1px solid #f1f5f9",
        flexShrink: 0
      }} 
    />
  );
}

/* ─── Tracking Stepper ─── */
function TrackingStepper({ order }: { order: Order }) {
  const isCancelled = order.status === "cancelled";
  const currentIdx = isCancelled ? -1 : currentStepIndex(order.status);

  if (isCancelled) {
    return (
      <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 16px", display: "flex", gap: 10 }}>
        <XCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#7f1d1d" }}>Order Cancelled</div>
          <div style={{ fontSize: 12, color: "#b91c1c", marginTop: 3 }}>{order.tracking_note ?? "This order has been cancelled."}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "4px 0" }}>
      {TRACKING_STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const future = i > currentIdx;
        const isLast = i === TRACKING_STEPS.length - 1;
        const stepEvents = order.events.filter((e) => e.status === step.status);
        const Icon = step.icon;

        return (
          <div key={step.status} style={{ display: "flex", gap: 12, position: "relative" }}>
            {/* Connector line */}
            {!isLast && (
              <div style={{
                position: "absolute", left: 15, top: 32, bottom: 0, width: 2,
                background: done ? "#16a34a" : "#e5e7eb",
              }} />
            )}

            {/* Icon circle */}
            <div style={{ position: "relative", zIndex: 1, paddingTop: 2, flexShrink: 0 }}>
              {done ? (
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Check size={16} color="#fff" />
                </div>
              ) : active ? (
                <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2.5px solid #16a34a", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#16a34a" }} />
                </div>
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #e5e7eb", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={14} color="#cbd5e1" />
                </div>
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 20 }}>
              <div style={{ fontSize: 13, fontWeight: active || done ? 700 : 500, color: future ? "#94a3b8" : "#0f172a", marginTop: 6 }}>
                {step.label}
                {active && (
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, background: "#dcfce7", color: "#15803d", padding: "2px 7px", borderRadius: 999 }}>
                    Current
                  </span>
                )}
              </div>

              {stepEvents.map((e) => (
                <div key={e.id} style={{ marginTop: 6 }}>
                  {e.message && <div style={{ fontSize: 12, color: "#475569" }}>{e.message}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 3 }}>
                    {e.location && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "#64748b" }}>
                        <MapPin size={11} color="#94a3b8" /> {e.location}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{formatDateTime(e.created_at)}</span>
                  </div>
                </div>
              ))}

              {step.status === "out_for_delivery" && active && order.estimated_delivery_date && (
                <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: "#15803d" }}>
                  Est. delivery: {formatDate(order.estimated_delivery_date)}
                </div>
              )}

              {step.status === "delivered" && done && order.delivered_at && (
                <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                  Delivered {formatDateTime(order.delivered_at)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Bottom Sheet ─── */
function BottomSheet({
  title, subtitle, extra, reasons, confirmLabel, confirmColor,
  onConfirm, onClose, loading,
}: {
  title: string; subtitle: string; extra?: React.ReactNode;
  reasons: string[]; confirmLabel: string; confirmColor: string;
  onConfirm: (reason: string) => void; onClose: () => void; loading: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [other, setOther] = useState("");
  const reason = selected === "Other" ? other.trim() : selected;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, margin: "0 auto", padding: "20px 20px 40px", maxHeight: "85svh", overflowY: "auto" }}>
        <div style={{ width: 36, height: 4, background: "#e5e7eb", borderRadius: 99, margin: "0 auto 20px" }} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{title}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>{subtitle}</div>
          </div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", display: "flex" }}>
            <X size={16} color="#64748b" />
          </button>
        </div>
        {extra}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {reasons.map((r) => (
            <button key={r} onClick={() => setSelected(r)} style={{
              textAlign: "left", padding: "12px 14px", borderRadius: 12, cursor: "pointer",
              fontFamily: "inherit", fontSize: 13, fontWeight: 600,
              background: selected === r ? "#0f172a" : "#f8fafc",
              color: selected === r ? "#fff" : "#374151",
              border: selected === r ? "2px solid #0f172a" : "2px solid transparent",
            }}>
              {r}
            </button>
          ))}
        </div>
        {selected === "Other" && (
          <textarea placeholder="Tell us more…" value={other} onChange={(e) => setOther(e.target.value)} rows={3} style={{ width: "100%", borderRadius: 12, border: "1.5px solid #e5e7eb", padding: "10px 14px", fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", marginBottom: 16, boxSizing: "border-box", color: "#0f172a" }} />
        )}
        <button disabled={!reason || loading} onClick={() => onConfirm(reason)} style={{ width: "100%", padding: "14px 0", borderRadius: 12, background: !reason || loading ? "#e5e7eb" : confirmColor, color: !reason || loading ? "#9ca3af" : "#fff", border: "none", fontSize: 14, fontWeight: 800, cursor: !reason || loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {loading ? "Please wait…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function MyOrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [returnOrder, setReturnOrder] = useState<Order | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  }

  const loadOrders = useCallback(async (uid: string) => {
    try {
      const { data: ordersData, error } = await supabase
        .from("orders")
        .select("id, created_at, status, total_cents, shipping_full_name, shipping_city, shipping_woreda, shipping_region, estimated_delivery_date, delivered_at, tracking_note, payment_method")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!ordersData?.length) { setOrders([]); return; }

      const orderIds = ordersData.map((o: any) => o.id);

      const [itemsRes, eventsRes] = await Promise.all([
        supabase.from("order_items")
          .select("id, order_id, name_snapshot, emoji_snapshot, image_url_snapshot, quantity, line_total_cents, product_id")
          .in("order_id", orderIds),
        supabase.from("order_tracking_events")
          .select("id, order_id, status, message, location, created_at")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false }),
      ]);

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
          product_id: item.product_id ?? null,
        });
      }

      const eventsByOrder: Record<string, TrackingEvent[]> = {};
      for (const ev of eventsRes.data ?? []) {
        if (!eventsByOrder[ev.order_id]) eventsByOrder[ev.order_id] = [];
        eventsByOrder[ev.order_id].push({
          id: ev.id, status: ev.status,
          message: ev.message ?? null, location: ev.location ?? null,
          created_at: ev.created_at,
        });
      }

      const built: Order[] = ordersData.map((o: any) => ({
        id: o.id, created_at: o.created_at, status: o.status,
        total_cents: o.total_cents ?? 0,
        shipping_full_name: o.shipping_full_name ?? null,
        shipping_city: o.shipping_city ?? null,
        shipping_woreda: o.shipping_woreda ?? null,
        shipping_region: o.shipping_region ?? null,
        estimated_delivery_date: o.estimated_delivery_date ?? null,
        delivered_at: o.delivered_at ?? null,
        tracking_note: o.tracking_note ?? null,
        payment_method: o.payment_method ?? null,
        items: itemsByOrder[o.id] ?? [],
        events: eventsByOrder[o.id] ?? [],
      }));

      setOrders(built);
    } catch (err) {
      console.error("[my-orders] load error:", err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/auth/login?redirect=/my-orders"); return; }
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) { router.replace("/auth/login?redirect=/my-orders"); return; }
      setUserId(user.id);
      await loadOrders(user.id);
      setLoading(false);
    }
    init();
  }, [loadOrders, router]);

  const totalsByStatus = useMemo(() => {
    const base = { all: orders.length, pending: 0, confirmed: 0, processing: 0, out_for_delivery: 0, delivered: 0, cancelled: 0 };
    for (const o of orders) {
      const s = o.status === "completed" ? "delivered" : o.status;
      if (s in base) (base as any)[s] += 1;
    }
    return base;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    let list = activeFilter === "all" ? orders : orders.filter((o) => {
      const s = o.status === "completed" ? "delivered" : o.status;
      return s === activeFilter;
    });
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((o) =>
      shortId(o.id).toLowerCase().includes(q) ||
      o.status.toLowerCase().includes(q) ||
      formatDate(o.created_at).toLowerCase().includes(q) ||
      o.items.some((i) => i.name_snapshot.toLowerCase().includes(q)) ||
      (o.shipping_city ?? "").toLowerCase().includes(q)
    );
  }, [orders, activeFilter, search]);

  async function handleCancelConfirm(reason: string) {
    if (!cancelOrder || !userId) return;
    try {
      setActingOn(cancelOrder.id);
      const { error } = await supabase.from("orders")
        .update({ status: "cancelled", cancel_reason: reason })
        .eq("id", cancelOrder.id).eq("user_id", userId);
      if (error) { showToast("Could not cancel. Please try again.", false); return; }
      setOrders((prev) => prev.map((o) => o.id === cancelOrder.id ? { ...o, status: "cancelled" } : o));
      showToast("Order cancelled.");
      setCancelOrder(null);
    } finally { setActingOn(null); }
  }

  async function handleReturnConfirm(reason: string) {
    if (!returnOrder || !userId) return;
    try {
      setActingOn(returnOrder.id);
      await supabase.from("return_requests").insert({
        order_id: returnOrder.id, user_id: userId, reason,
        status: "pending", created_at: new Date().toISOString(),
      });
      showToast("Return request submitted. We'll be in touch.");
      setReturnOrder(null);
    } finally { setActingOn(null); }
  }

  const filters = [
    { key: "all",              label: "All",         count: totalsByStatus.all },
    { key: "pending",          label: "Placed",      count: totalsByStatus.pending },
    { key: "processing",       label: "Processing",  count: totalsByStatus.processing },
    { key: "out_for_delivery", label: "On the way",  count: totalsByStatus.out_for_delivery },
    { key: "delivered",        label: "Delivered",   count: totalsByStatus.delivered },
    { key: "cancelled",        label: "Cancelled",   count: totalsByStatus.cancelled },
  ];

  return (
    <main style={{ minHeight: "100svh", background: "#f8fafc", paddingBottom: 90 }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: toast.ok ? "#0f172a" : "#dc2626", color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 12, fontWeight: 700, boxShadow: "0 8px 24px rgba(0,0,0,0.22)", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {toast.msg}
        </div>
      )}

      {/* Dialogs */}
      {cancelOrder && (
        <BottomSheet
          title="Cancel Order" subtitle="Help us understand why you're cancelling"
          reasons={CANCEL_REASONS} confirmLabel="Confirm Cancellation" confirmColor="#dc2626"
          onConfirm={handleCancelConfirm} onClose={() => setCancelOrder(null)}
          loading={actingOn === cancelOrder.id}
          extra={<div style={{ padding: "10px 12px", background: "#fef2f2", borderRadius: 10, marginBottom: 14, fontSize: 12, color: "#7f1d1d", fontWeight: 600 }}>#{shortId(cancelOrder.id)} · {formatDate(cancelOrder.created_at)} · {money(cancelOrder.total_cents)}</div>}
        />
      )}
      {returnOrder && (
        <BottomSheet
          title="Request a Return" subtitle="We'll review your request within 24 hours"
          reasons={RETURN_REASONS} confirmLabel="Submit Return Request" confirmColor="#1d4ed8"
          onConfirm={handleReturnConfirm} onClose={() => setReturnOrder(null)}
          loading={actingOn === returnOrder.id}
          extra={<div style={{ padding: "10px 12px", background: "#eff6ff", borderRadius: 10, marginBottom: 14, fontSize: 12, color: "#1e40af", fontWeight: 600 }}>#{shortId(returnOrder.id)} · {formatDate(returnOrder.created_at)} · {money(returnOrder.total_cents)}</div>}
        />
      )}

      {/* Clean header */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(255,255,255,0.98)", backdropFilter: "blur(12px)", borderBottom: "1px solid #e5e7eb", padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => router.push("/")} style={{ background: "#f1f5f9", border: "none", borderRadius: 10, cursor: "pointer", padding: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ArrowLeft size={18} color="#0f172a" />
            </button>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>My Orders</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{orders.length} orders total</div>
            </div>
          </div>
          <button onClick={() => userId && loadOrders(userId)} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "#475569", cursor: "pointer", fontFamily: "inherit" }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search size={16} color="#94a3b8" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            type="text" placeholder="Search orders, items, or locations..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "11px 12px 11px 40px", borderRadius: 12, border: "1.5px solid #e5e7eb", fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#0f172a", background: "#f1f5f9" }}
          />
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 4 }}>
          {filters.map((f) => {
            const on = activeFilter === f.key;
            return (
              <button key={f.key} onClick={() => setActiveFilter(f.key)} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, border: on ? "none" : "1px solid #e5e7eb", background: on ? "#0f172a" : "#fff", color: on ? "#fff" : "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, boxShadow: on ? "0 2px 8px rgba(0,0,0,0.1)" : "none" }}>
                {f.label}
                {f.count > 0 && <span style={{ fontSize: 11, fontWeight: 700, background: on ? "rgba(255,255,255,0.25)" : "#f1f5f9", color: on ? "#fff" : "#64748b", padding: "2px 8px", borderRadius: 10 }}>{f.count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ padding: 16 }}>
                <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: "#f1f5f9" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 14, background: "#f1f5f9", borderRadius: 6, width: "60%", marginBottom: 8 }} />
                    <div style={{ height: 12, background: "#f1f5f9", borderRadius: 6, width: "40%" }} />
                  </div>
                </div>
                <div style={{ height: 10, background: "#f1f5f9", borderRadius: 5, width: "30%" }} />
              </div>
            </div>
          ))
        ) : filteredOrders.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 16, padding: "56px 24px", textAlign: "center", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28 }}>
              📦
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
              {search ? "No results found" : activeFilter === "all" ? "No orders yet" : `No ${activeFilter.replace("_", " ")} orders`}
            </div>
            <div style={{ fontSize: 14, color: "#64748b", marginBottom: 20 }}>
              {search ? "Try a different search term." : "Place your first order to see it here."}
            </div>
            <button onClick={() => router.push("/shop")} style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 12, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Start shopping
            </button>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isExpanded = expandedId === order.id;
            const color = statusColor(order.status);
            const bg = statusBg(order.status);
            const isPending = order.status === "pending";
            const isCompleted = order.status === "delivered" || order.status === "completed";
            const isActive = !isPending && !isCompleted && order.status !== "cancelled";
            const paymentLabel = getPaymentMethodLabel(order.payment_method);
            const firstItem = order.items[0];

            return (
              <div key={order.id} style={{ background: "#fff", borderRadius: 16, overflow: "hidden", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

                {/* Order card header - CLEAN LIGHT DESIGN */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", textAlign: "left" }}
                >
                  {/* Top row: Order ID + Date + Amount */}
                  <div style={{ padding: "16px 16px 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" }}>#{shortId(order.id)}</span>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>·</span>
                        <span style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 4 }}>
                          <Calendar size={12} /> {formatDate(order.created_at)}
                        </span>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>
                        {money(order.total_cents)}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: bg, color, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 20, border: `1px solid ${color}20` }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        {statusLabel(order.status)}
                      </span>
                      {isExpanded ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                    </div>
                  </div>

                  {/* Middle: Item preview */}
                  <div style={{ padding: "0 16px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    {order.items.length > 1 ? (
                      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                        {order.items.slice(0, 3).map((it, i) => (
                          <ProductImage 
                            key={i} 
                            src={it.image_url_snapshot} 
                            emoji={it.emoji_snapshot} 
                            alt={it.name_snapshot}
                            size={44}
                          />
                        ))}
                        {order.items.length > 3 && (
                          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#f1f5f9", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#64748b", flexShrink: 0 }}>
                            +{order.items.length - 3}
                          </div>
                        )}
                      </div>
                    ) : (
                      <ProductImage 
                        src={firstItem?.image_url_snapshot} 
                        emoji={firstItem?.emoji_snapshot} 
                        alt={firstItem?.name_snapshot || "Product"}
                        size={48}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {firstItem?.name_snapshot || "Order items"}
                        {order.items.length > 1 && <span style={{ color: "#94a3b8", fontWeight: 400 }}> +{order.items.length - 1} more</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 3, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{order.items.reduce((a, it) => a + it.quantity, 0)} items</span>
                        {paymentLabel && (
                          <>
                            <span>·</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                              <CreditCard size={11} /> {paymentLabel}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {isActive && (
                      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#2563eb", background: "#eff6ff", padding: "6px 10px", borderRadius: 8 }}>
                        <Truck size={14} /> On the way
                      </div>
                    )}
                  </div>
                </button>

                {/* Expanded: tracking + items + actions */}
                {isExpanded && (
                  <div style={{ borderTop: "1px solid #f1f5f9", padding: "16px" }}>

                    {/* Tracking stepper */}
                    <div style={{ marginBottom: 16, background: "#fafafa", borderRadius: 12, padding: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Order Progress</div>
                      <TrackingStepper order={order} />
                    </div>

                    {/* Delivery address */}
                    {(order.shipping_full_name || order.shipping_city) && (
                      <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px", marginBottom: 16, display: "flex", gap: 10, border: "1px solid #f1f5f9" }}>
                        <MapPin size={16} color="#64748b" style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
                          <div style={{ fontWeight: 600, color: "#0f172a", marginBottom: 2 }}>Delivery Address</div>
                          {[order.shipping_full_name, order.shipping_woreda, order.shipping_city, order.shipping_region].filter(Boolean).join(", ")}
                        </div>
                      </div>
                    )}

                    {/* Items list */}
                    <div style={{ background: "#fafafa", borderRadius: 12, overflow: "hidden", marginBottom: 16, border: "1px solid #f1f5f9" }}>
                      <div style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>Items</div>
                      {order.items.map((it, idx) => (
                        <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: idx < order.items.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                          <ProductImage 
                            src={it.image_url_snapshot} 
                            emoji={it.emoji_snapshot} 
                            alt={it.name_snapshot}
                            size={40}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name_snapshot}</div>
                            <div style={{ fontSize: 12, color: "#64748b" }}>Qty {it.quantity}</div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", flexShrink: 0 }}>{money(it.line_total_cents)}</div>
                        </div>
                      ))}
                      <div style={{ padding: "10px 14px", borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
                        <span style={{ fontSize: 12, color: "#64748b" }}>Order Total</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{money(order.total_cents)}</span>
                      </div>
                    </div>

                    {/* Tracking history */}
                    {order.events.length > 0 && (
                      <div style={{ background: "#fafafa", borderRadius: 12, overflow: "hidden", marginBottom: 16, border: "1px solid #f1f5f9" }}>
                        <div style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>History</div>
                        {order.events.map((ev) => (
                          <div key={ev.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderBottom: "1px solid #f1f5f9" }}>
                            <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(ev.status), flexShrink: 0, marginTop: 5 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{statusLabel(ev.status)}</div>
                              {ev.message && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{ev.message}</div>}
                              {ev.location && <div style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}><MapPin size={10} /> {ev.location}</div>}
                            </div>
                            <div style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap", flexShrink: 0 }}>{formatDateTime(ev.created_at)}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        onClick={() => {
                          const items = order.items;
                          if (!items.length) { showToast("No items to re-order.", false); return; }
                          // FIX: Use product_id if available, otherwise fallback to item id
                          const cart: Cart = items.map((it) => ({ 
                            id: it.product_id || it.id, 
                            kind: "approved" as const, 
                            quantity: it.quantity 
                          }));
                          localStorage.setItem(CART_KEY, JSON.stringify(cart));
                          router.push("/checkout");
                        }}
                        style={{ flex: 1, minWidth: 100, padding: "12px 0", borderRadius: 10, background: "#0f172a", border: "none", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                      >
                        <RotateCcw size={15} /> Buy Again
                      </button>

                      {isPending && (
                        <button
                          onClick={() => setCancelOrder(order)}
                          style={{ flex: 1, minWidth: 100, padding: "12px 0", borderRadius: 10, background: "#fff", border: "1.5px solid #dc2626", fontSize: 13, fontWeight: 700, color: "#dc2626", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                        >
                          <X size={15} /> Cancel
                        </button>
                      )}

                      {isCompleted && (
                        <button
                          onClick={() => setReturnOrder(order)}
                          style={{ flex: 1, minWidth: 100, padding: "12px 0", borderRadius: 10, background: "#fff", border: "1.5px solid #2563eb", fontSize: 13, fontWeight: 700, color: "#2563eb", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                        >
                          <PackageOpen size={15} /> Return
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}