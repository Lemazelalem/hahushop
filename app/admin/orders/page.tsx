// app/admin/orders/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Shield,
  Package,
  ShoppingCart,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Search,
  MapPin,
  AlertCircle,
  RefreshCw,
  Phone,
  Mail,
  CreditCard,
  Truck,
  ArrowRight,
  Navigation,
  MessageSquare,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  DollarSign,
  FileText,
  X,
  Banknote,
} from "lucide-react";
import {
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getPaymentStatusBadgeClass,
  isBankTransferMethod,
} from "@/lib/paymentMethods";

/* ══════════════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════════════ */

type ProductRow = {
  id: string;
  seller_id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  status: string;
  seller_price_cents: number | null;
  final_price_cents: number | null;
  price_cents: number | null;
  created_at: string;
};

type RealOrder = {
  id: string;
  created_at: string;
  user_id: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  total_cents: number | null;
  status: string;
  shipping_name: string | null;
  shipping_email: string | null;
  shipping_phone: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_country: string | null;
  shipping_postal_code: string | null;
  shipping_notes: string | null;
  cart_snapshot: any | null;
  payment_method: string | null;
  payment_status: string | null;
  estimated_delivery_date: string | null;
};

type TrackingEvent = {
  id: string;
  status: string;
  message: string | null;
  location: string | null;
  created_at: string;
};

type TrackingState = {
  events: TrackingEvent[];
  loaded: boolean;
  loading: boolean;
  newStatus: string;
  message: string;
  location: string;
  estDelivery: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
  panelOpen: boolean;
};

type OrderStatus = "pending" | "processing" | "completed" | "cancelled";

type BankSettings = {
  bank_title: string | null;
  bank_instructions: string | null;
};

type PaymentRecord = {
  id: string;
  order_id: string;
  amount_cents: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
};

/* ══════════════════════════════════════════════════════════════════════════════
   TRACKING CONSTANTS
══════════════════════════════════════════════════════════════════════════════ */

const TRACKING_STATUSES = [
  { value: "pending", label: "Order Placed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const MANUAL_PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "check", label: "Check" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "wire_transfer", label: "Wire Transfer" },
  { value: "other", label: "Other" },
];

function trackingStatusColor(status: string): string {
  if (status === "delivered") return "#22c55e";
  if (status === "cancelled") return "#ef4444";
  if (status === "out_for_delivery") return "#3b82f6";
  if (status === "processing") return "#8b5cf6";
  if (status === "confirmed") return "#f59e0b";
  return "#94a3b8";
}

function trackingStatusLabel(status: string): string {
  return (
    TRACKING_STATUSES.find((s) => s.value === status)?.label ??
    status.replace(/_/g, " ")
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════════════ */

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatMoney(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "ETB 0.00";
  return `ETB ${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTimeLong(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeParseCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const asNumber = Number(trimmed.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(asNumber) || asNumber <= 0) return null;
  return Math.round(asNumber * 100);
}

function exportOrdersCSV(orders: RealOrder[]) {
  const header = [
    "Order ID",
    "Date",
    "Customer",
    "Email",
    "Phone",
    "Status",
    "Payment Method",
    "Payment Status",
    "Subtotal",
    "Tax",
    "Total",
    "City",
    "Country",
  ].join(",");

  const rows = orders.map((o) =>
    [
      o.id,
      formatDate(o.created_at),
      o.shipping_name || "",
      o.shipping_email || "",
      o.shipping_phone || "",
      o.status,
      getPaymentMethodLabel(o.payment_method),
      o.payment_status || "",
      o.subtotal_cents ? o.subtotal_cents / 100 : 0,
      o.tax_cents ? o.tax_cents / 100 : 0,
      o.total_cents ? o.total_cents / 100 : 0,
      o.shipping_city || "",
      o.shipping_country || "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ══════════════════════════════════════════════════════════════════════════════
   STATUS CONFIG
══════════════════════════════════════════════════════════════════════════════ */

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; className: string; icon: any }
> = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800 border-amber-200",
    icon: Clock,
  },
  processing: {
    label: "Processing",
    className: "bg-sky-100 text-sky-800 border-sky-200",
    icon: Loader2,
  },
  completed: {
    label: "Completed",
    className:
      "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: CheckCircle,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-rose-100 text-rose-800 border-rose-200",
    icon: XCircle,
  },
};

const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["completed", "cancelled"],
  completed: [],
  cancelled: ["pending"],
};

/* ══════════════════════════════════════════════════════════════════════════════
   PAYMENT RECORD MODAL COMPONENT
══════════════════════════════════════════════════════════════════════════════ */

function PaymentRecordModal({
  isOpen,
  onClose,
  order,
  onSave,
  loading,
}: {
  isOpen: boolean;
  onClose: () => void;
  order: RealOrder | null;
  onSave: (data: {
    amount_cents: number;
    payment_date: string;
    payment_method: string;
    reference_number: string;
    notes: string;
  }) => Promise<void>;
  loading: boolean;
}) {
  const [formData, setFormData] = useState({
    amount: "",
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: "cash",
    reference_number: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && order) {
      // Pre-fill with order total
      const total = order.total_cents ? (order.total_cents / 100).toFixed(2) : "";
      setFormData({
        amount: total,
        payment_date: new Date().toISOString().slice(0, 10),
        payment_method: "cash",
        reference_number: "",
        notes: "",
      });
      setError(null);
    }
  }, [isOpen, order]);

  if (!isOpen || !order) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountCents = safeParseCents(formData.amount);
    if (!amountCents) {
      setError("Please enter a valid amount");
      return;
    }

    if (!formData.payment_date) {
      setError("Please select a payment date");
      return;
    }

    await onSave({
      amount_cents: amountCents,
      payment_date: formData.payment_date,
      payment_method: formData.payment_method,
      reference_number: formData.reference_number.trim() || "",
      notes: formData.notes.trim() || "",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-lime-400" />
            <h2 className="text-lg font-bold">Record Payment</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Order Info */}
          <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Order</span>
              <span className="font-mono font-semibold text-slate-900">
                #{order.id.slice(0, 8)}…
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Customer</span>
              <span className="font-semibold text-slate-900">
                {order.shipping_name || "Guest"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Order Total</span>
              <span className="font-bold text-slate-900">
                {formatMoney(order.total_cents)}
              </span>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" />
              Amount Received (ETB) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={formData.amount}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, amount: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400"
              placeholder="0.00"
            />
          </div>

          {/* Payment Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" />
              Payment Date *
            </label>
            <input
              type="date"
              required
              value={formData.payment_date}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, payment_date: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" />
              Payment Method *
            </label>
            <select
              required
              value={formData.payment_method}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, payment_method: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400"
            >
              {MANUAL_PAYMENT_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reference Number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              Reference / Transaction ID
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={formData.reference_number}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, reference_number: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400"
              placeholder="e.g., TXN123456, Check #001"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              Notes
              <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400 resize-none"
              placeholder="Additional payment details..."
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
              <p className="text-xs text-rose-700">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm text-slate-900 transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: "linear-gradient(90deg,#a3e635,#22d3ee)" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving…
                </span>
              ) : (
                "✓ Confirm Payment"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   TRACKING PANEL COMPONENT
══════════════════════════════════════════════════════════════════════════════ */

function TrackingPanel({
  orderId,
  orderStatus,
  estimatedDeliveryDate,
}: {
  orderId: string;
  orderStatus: string;
  estimatedDeliveryDate: string | null;
}) {
  const [state, setState] = useState<TrackingState>({
    events: [],
    loaded: false,
    loading: false,
    newStatus: orderStatus,
    message: "",
    location: "",
    estDelivery: estimatedDeliveryDate ? estimatedDeliveryDate.slice(0, 10) : "",
    saving: false,
    saved: false,
    error: null,
    panelOpen: false,
  });

  function set(patch: Partial<TrackingState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  async function loadEventsOrToggle() {
    if (state.loaded) {
      set({ panelOpen: !state.panelOpen });
      return;
    }

    set({ loading: true, panelOpen: true, error: null });
    const { data, error } = await supabase
      .from("order_tracking_events")
      .select("id, status, message, location, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) {
      set({ loading: false, loaded: true, error: error.message });
      return;
    }

    set({ loading: false, loaded: true, events: (data ?? []) as TrackingEvent[] });
  }

  async function handleSave() {
    set({ saving: true, error: null, saved: false });

    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr) throw authErr;
      if (!user) throw new Error("Not authenticated");

      // 1) Insert event
      const { error: evErr } = await supabase
        .from("order_tracking_events")
        .insert({
          order_id: orderId,
          status: state.newStatus,
          message: state.message.trim() || null,
          location: state.location.trim() || null,
          created_by: user.id,
        });

      if (evErr) throw evErr;

      // 2) Update orders table (status + optional est delivery + optional delivered_at)
      const updatePayload: Record<string, any> = {
        status: state.newStatus === "delivered" ? "completed" : state.newStatus,
      };

      if (state.estDelivery) {
        updatePayload.estimated_delivery_date = new Date(state.estDelivery).toISOString();
      }

      if (state.newStatus === "delivered") {
        updatePayload.delivered_at = new Date().toISOString();
      }

      const { error: upErr } = await supabase
        .from("orders")
        .update(updatePayload)
        .eq("id", orderId);

      if (upErr) throw upErr;

      // 3) Update local list (optimistic event)
      const newEvent: TrackingEvent = {
        id: crypto.randomUUID(),
        status: state.newStatus,
        message: state.message.trim() || null,
        location: state.location.trim() || null,
        created_at: new Date().toISOString(),
      };

      set({
        saving: false,
        saved: true,
        message: "",
        location: "",
        events: [newEvent, ...state.events],
      });

      setTimeout(() => set({ saved: false }), 3000);
    } catch (err: any) {
      set({ saving: false, error: err?.message ?? "Failed to update tracking" });
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      {/* Toggle header */}
      <button
        type="button"
        onClick={loadEventsOrToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-900 text-white hover:bg-slate-800 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-bold">
          <Truck className="w-4 h-4 text-lime-400" />
          Tracking & Delivery
        </div>
        {state.panelOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {state.panelOpen && (
        <div className="bg-white p-4 space-y-4">
          {state.loading ? (
            <div className="flex items-center gap-2 py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              <span className="text-xs text-slate-500">Loading tracking…</span>
            </div>
          ) : (
            <>
              {/* Update form */}
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Add Tracking Update
                </div>

                {/* Status */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Status
                  </label>
                  <select
                    value={state.newStatus}
                    onChange={(e) => set({ newStatus: e.target.value })}
                    className="w-full rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400"
                  >
                    {TRACKING_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Message + Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" /> Message
                      <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={state.message}
                      onChange={(e) => set({ message: e.target.value })}
                      placeholder="e.g. Package picked up"
                      className="w-full rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                      <Navigation className="w-3 h-3" /> Location
                      <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={state.location}
                      onChange={(e) => set({ location: e.target.value })}
                      placeholder="e.g. Bole Facility"
                      className="w-full rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400"
                    />
                  </div>
                </div>

                {/* Est. delivery */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                    <CalendarDays className="w-3 h-3" /> Estimated Delivery Date
                    <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={state.estDelivery}
                    onChange={(e) => set({ estDelivery: e.target.value })}
                    className="w-full rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400"
                  />
                </div>

                {/* Feedback */}
                {state.error && (
                  <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                    <p className="text-[11px] text-rose-700">{state.error}</p>
                  </div>
                )}

                {state.saved && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    <p className="text-[11px] text-emerald-700 font-bold">
                      Tracking updated
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={state.saving}
                  className="w-full py-2 rounded-full font-bold text-xs text-slate-900 transition-all hover:opacity-90 disabled:opacity-60"
                  style={{ background: "linear-gradient(90deg,#a3e635,#22d3ee)" }}
                >
                  {state.saving ? "Saving…" : "Push Tracking Update →"}
                </button>
              </div>

              {/* Event history */}
              {state.events.length > 0 && (
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Tracking History
                    </span>
                  </div>

                  <div className="divide-y divide-slate-50">
                    {state.events.map((ev) => (
                      <div key={ev.id} className="flex items-start gap-3 px-4 py-3">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                          style={{ background: trackingStatusColor(ev.status) }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold text-slate-700">
                            {trackingStatusLabel(ev.status)}
                          </div>

                          {ev.message && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {ev.message}
                            </div>
                          )}

                          {ev.location && (
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="w-2.5 h-2.5" />
                              {ev.location}
                            </div>
                          )}
                        </div>

                        <div className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">
                          {formatDateTime(ev.created_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {state.events.length === 0 && state.loaded && (
                <div className="text-center py-3">
                  <Package className="w-6 h-6 text-slate-200 mx-auto mb-1" />
                  <p className="text-[11px] text-slate-400">No tracking events yet</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════════ */

export default function AdminOrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [priceErrors, setPriceErrors] = useState<Record<string, string>>({});

  const [realOrders, setRealOrders] = useState<RealOrder[]>([]);
  const [orderSearch, setOrderSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [bankSettings, setBankSettings] = useState<BankSettings | null>(null);
  const [orderItemsMap, setOrderItemsMap] = useState<Record<string, any[]>>({});
  const [orderSellersMap, setOrderSellersMap] = useState<Record<string, Record<string, { display_name: string | null; email: string | null; phone: string | null; business_name: string | null }>>>({});

  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<RealOrder | null>(null);
  const [recordingPayment, setRecordingPayment] = useState(false);

  /* ── Load ── */

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setPageError(null);

      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;

        const user = userData?.user;
        if (!user) {
          if (!alive) return;
          setPageError("Authentication required");
          setLoading(false);
          return;
        }

        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profileErr) throw profileErr;

        if (!profile || profile.role !== "admin") {
          if (!alive) return;
          setPageError("Access denied");
          setLoading(false);
          return;
        }

        if (!alive) return;
        setAuthorized(true);

        const [{ data: productsData, error: prodErr }, { data: ordersData, error: ordErr }, { data: payData, error: payErr }] =
          await Promise.all([
            supabase
              .from("products")
              .select(
                "id, seller_id, name, description, emoji, status, seller_price_cents, final_price_cents, price_cents, created_at"
              )
              .eq("status", "submitted")
              .order("created_at", { ascending: false }),
            supabase
              .from("orders")
              .select(
                `
                id, created_at, user_id,
                subtotal_cents, tax_cents, total_cents,
                status, shipping_name, shipping_email, shipping_phone,
                shipping_address_line1, shipping_address_line2,
                shipping_city, shipping_state, shipping_country,
                shipping_postal_code, shipping_notes,
                cart_snapshot, payment_method, payment_status,
                estimated_delivery_date
              `
              )
              .order("created_at", { ascending: false }),
            supabase
              .from("payment_settings")
              .select("bank_title, bank_instructions")
              .eq("id", 1)
              .maybeSingle(),
          ]);

        if (prodErr) throw prodErr;
        if (ordErr) throw ordErr;
        if (payErr) throw payErr;

        if (!alive) return;

        if (productsData) {
          setProducts(productsData as ProductRow[]);
          const initialPriceInputs: Record<string, string> = {};
          for (const p of productsData as any[]) {
            const display = p.final_price_cents ?? p.seller_price_cents;
            if (display && display > 0) initialPriceInputs[p.id] = (display / 100).toFixed(2);
          }
          setPriceInputs(initialPriceInputs);
        }

        if (ordersData) setRealOrders(ordersData as RealOrder[]);
        if (payData) {
          setBankSettings({
            bank_title: payData.bank_title ?? null,
            bank_instructions: payData.bank_instructions ?? null,
          });
        }
      } catch (err: any) {
        if (!alive) return;
        setPageError(err?.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  /* ── Stats ── */

  const globalStats = useMemo(
    () => ({
      total: realOrders.length,
      pending: realOrders.filter((o) => o.status === "pending").length,
      processing: realOrders.filter((o) => o.status === "processing").length,
      completed: realOrders.filter((o) => o.status === "completed").length,
      totalRevenue: realOrders
        .filter((o) => o.status === "completed")
        .reduce((acc, o) => acc + (o.total_cents || 0), 0),
    }),
    [realOrders]
  );

  const filteredOrders = useMemo(() => {
    let base = [...realOrders];

    if (orderSearch.trim()) {
      const q = orderSearch.toLowerCase().trim();
      base = base.filter((o) => {
        return (
          o.id.toLowerCase().includes(q) ||
          (o.shipping_name || "").toLowerCase().includes(q) ||
          (o.shipping_email || "").toLowerCase().includes(q) ||
          (o.shipping_phone || "").toLowerCase().includes(q)
        );
      });
    }

    if (statusFilter !== "all") base = base.filter((o) => o.status === statusFilter);
    return base;
  }, [realOrders, orderSearch, statusFilter]);

  const pendingApprovals = useMemo(
    () => products.filter((p) => p.status === "submitted"),
    [products]
  );
  const visibleApprovals = pendingApprovals.slice(0, 5);
  const hiddenApprovalCount = Math.max(0, pendingApprovals.length - 5);

  /* ── Product actions ── */

  const updateProduct = useCallback(
    async (id: string, updates: Partial<ProductRow>) => {
      setSavingId(id);
      try {
        const { price_cents: _drop, ...safeUpdates } = updates as any;

        const { data, error } = await supabase
          .from("products")
          .update(safeUpdates)
          .eq("id", id)
          .select()
          .maybeSingle();

        if (error) throw error;
        if (data) setProducts((prev) => prev.map((p) => (p.id === id ? (data as ProductRow) : p)));
      } finally {
        setSavingId(null);
      }
    },
    []
  );

  const handleSavePrice = useCallback(
    async (id: string) => {
      const cents = safeParseCents(priceInputs[id] || "");
      if (cents === null) {
        setPriceErrors((prev) => ({ ...prev, [id]: "Enter a valid price" }));
        return;
      }
      setPriceErrors((prev) => ({ ...prev, [id]: "" }));
      await updateProduct(id, { final_price_cents: cents });
    },
    [priceInputs, updateProduct]
  );

  const handleApprove = useCallback(
    async (id: string) => {
      const typedCents = safeParseCents(priceInputs[id] || "");
      const current = products.find((p) => p.id === id);
      const finalCents = typedCents ?? current?.final_price_cents;

      if (!finalCents || finalCents <= 0) {
        setPriceErrors((prev) => ({ ...prev, [id]: "Set a final price before approving" }));
        return;
      }

      setPriceErrors((prev) => ({ ...prev, [id]: "" }));
      await updateProduct(id, { status: "approved", final_price_cents: finalCents });
    },
    [products, priceInputs, updateProduct]
  );

  const handleReject = useCallback(
    async (id: string) => {
      const ok = window.confirm("Reject this product? The seller will be notified.");
      if (!ok) return;
      await updateProduct(id, { status: "rejected" });
    },
    [updateProduct]
  );

  /* ── Order actions ── */

  const handleUpdateOrderStatus = useCallback(async (orderId: string, nextStatus: OrderStatus) => {
    const needsConfirm = nextStatus === "completed" || nextStatus === "cancelled";
    if (needsConfirm) {
      const ok = window.confirm(
        `Mark this order as "${STATUS_CONFIG[nextStatus].label}"? This cannot be easily undone.`
      );
      if (!ok) return;
    }

    setUpdatingOrderId(orderId);
    try {
      const { error } = await supabase.from("orders").update({ status: nextStatus }).eq("id", orderId);
      if (error) throw error;

      setRealOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    } finally {
      setUpdatingOrderId(null);
    }
  }, []);

  const handleMarkPaymentPaid = useCallback(async (orderId: string) => {
    const ok = window.confirm("Mark this payment as received/paid?");
    if (!ok) return;

    setUpdatingOrderId(orderId);
    try {
      const { error } = await supabase.from("orders").update({ payment_status: "paid" }).eq("id", orderId);
      if (error) throw error;

      setRealOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, payment_status: "paid" } : o)));
    } finally {
      setUpdatingOrderId(null);
    }
  }, []);

  /* ── Payment Recording ── */

  const openPaymentModal = useCallback((order: RealOrder) => {
    setSelectedOrderForPayment(order);
    setPaymentModalOpen(true);
  }, []);

  const closePaymentModal = useCallback(() => {
    setPaymentModalOpen(false);
    setSelectedOrderForPayment(null);
  }, []);

  const handleRecordPayment = useCallback(async (data: {
    amount_cents: number;
    payment_date: string;
    payment_method: string;
    reference_number: string;
    notes: string;
  }) => {
    if (!selectedOrderForPayment) return;

    setRecordingPayment(true);
    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (authErr) throw authErr;
      if (!user) throw new Error("Not authenticated");

      // 1) Insert payment record
      const { error: paymentError } = await supabase
        .from("payment_records")
        .insert({
          order_id: selectedOrderForPayment.id,
          amount_cents: data.amount_cents,
          payment_date: data.payment_date,
          payment_method: data.payment_method,
          reference_number: data.reference_number || null,
          notes: data.notes || null,
          recorded_by: user.id,
        });

      if (paymentError) throw paymentError;

      // 2) Update order payment status
      const { error: orderError } = await supabase
        .from("orders")
        .update({ payment_status: "paid" })
        .eq("id", selectedOrderForPayment.id);

      if (orderError) throw orderError;

      // 3) Update local state
      setRealOrders((prev) =>
        prev.map((o) =>
          o.id === selectedOrderForPayment.id ? { ...o, payment_status: "paid" } : o
        )
      );

      closePaymentModal();
    } catch (err: any) {
      throw err; // Let modal handle error display
    } finally {
      setRecordingPayment(false);
    }
  }, [selectedOrderForPayment, closePaymentModal]);

  const toggleExpand = useCallback(async (orderId: string) => {
    setExpandedOrderId((prev) => (prev === orderId ? null : orderId));
    // Fetch real order items + seller info on first expand
    if (!orderItemsMap[orderId]) {
      try {
        const res = await fetch(`/api/admin/order-items?orderId=${orderId}`);
        if (res.ok) {
          const data = await res.json();
          setOrderItemsMap((prev) => ({ ...prev, [orderId]: data.items ?? [] }));
          setOrderSellersMap((prev) => ({ ...prev, [orderId]: data.sellers ?? {} }));
        }
      } catch {
        // silently ignore — fallback to cart_snapshot
      }
    }
  }, [orderItemsMap]);

  /* ── Access denied ── */

  if (!loading && !authorized) {
    return (
      <main className="min-h-screen px-4 py-6 md:px-10">
        <div className="bg-scene" />
        <div className="bg-vignette" />
        <div className="sparkles" />

        <div className="mx-auto max-w-md mt-20 text-center">
          <Shield className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h1>
          <p className="text-sm text-slate-600 mb-5">{pageError}</p>
          <button
            onClick={() => router.push("/admin")}
            className="btn-cta rounded-full px-5 py-2 text-xs font-semibold text-slate-900"
          >
            ← Back to admin
          </button>
        </div>
      </main>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════════════
     MAIN UI
  ═══════════════════════════════════════════════════════════════════════════════ */

  return (
    <main className="min-h-screen px-4 py-6 md:px-10">
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      {/* Payment Modal */}
      <PaymentRecordModal
        isOpen={paymentModalOpen}
        onClose={closePaymentModal}
        order={selectedOrderForPayment}
        onSave={handleRecordPayment}
        loading={recordingPayment}
      />

      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <section className="glass glass-card glow-blue glass-ring rounded-[28px] p-6 md:p-8 mt-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                Admin
              </div>
              <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 mt-1">
                Customer Orders
              </h1>
              <p className="mt-1.5 text-sm text-slate-700 max-w-xl">
                Review orders, update status, push tracking events, and confirm payments.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                onClick={() => router.push("/admin")}
                className="pill px-4 py-2 text-xs font-semibold text-slate-900"
              >
                ← Back to admin
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-full bg-slate-900 text-white px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
                <button
                  onClick={() => exportOrdersCSV(filteredOrders)}
                  className="pill px-4 py-1.5 text-xs font-semibold text-slate-900"
                >
                  Export CSV
                </button>
              </div>
            </div>
          </div>

          {pageError && (
            <div className="mt-4 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
              {pageError}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2 text-[11px]">
            {[
              { label: "All orders", value: globalStats.total, filter: "all" },
              { label: "Pending", value: globalStats.pending, filter: "pending" },
              { label: "Processing", value: globalStats.processing, filter: "processing" },
              { label: "Completed", value: globalStats.completed, filter: "completed" },
            ].map((s) => (
              <button
                key={s.label}
                onClick={() => setStatusFilter(s.filter as any)}
                className="pill px-3 py-1 bg-white/80 border border-white/90 hover:bg-white transition-colors"
              >
                <span className="text-slate-500">{s.label}: </span>
                <span className="font-semibold text-slate-800">{s.value}</span>
              </button>
            ))}

            <div className="pill px-3 py-1 bg-white/80 border border-white/90 ml-auto">
              <span className="text-slate-500">Revenue: </span>
              <span className="font-semibold text-slate-800">
                {formatMoney(globalStats.totalRevenue)}
              </span>
            </div>
          </div>
        </section>

        {/* Body */}
        <section className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Orders — 2/3 */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filter bar */}
            <div className="glass glass-card glass-ring rounded-[22px] p-4 flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by ID, name, email, or phone…"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="w-full rounded-full border border-slate-300 bg-white/90 pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="rounded-full border border-slate-300 bg-white/90 px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/40"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <div className="text-[11px] text-slate-600 ml-auto">
                <span className="font-semibold">{filteredOrders.length}</span> orders
              </div>
            </div>

            {/* Order cards */}
            {loading ? (
              <div className="rounded-[22px] bg-white/80 border border-white/90 px-6 py-10 flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                <span className="text-sm text-slate-600">Loading orders…</span>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="rounded-[22px] bg-white/80 border border-white/90 px-6 py-10 text-center">
                <ShoppingCart className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-900">No orders found</p>
                <p className="text-xs text-slate-500 mt-1">
                  Try adjusting your search or filter.
                </p>
              </div>
            ) : (
              filteredOrders.map((order) => {
                const statusKey = (order.status || "pending").toLowerCase() as OrderStatus;
                const cfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.pending;
                const StatusIcon = cfg.icon;

                const isExpanded = expandedOrderId === order.id;
                const isUpdating = updatingOrderId === order.id;

                const snapshot = order.cart_snapshot || {};
                const items: any[] = Array.isArray(snapshot.items) ? snapshot.items : [];
                const itemsCount = items.reduce((acc, it) => acc + (Number(it.qty) || 1), 0);
                const firstItem = items[0];

                const addressShort = [
                  order.shipping_address_line1,
                  order.shipping_city,
                  order.shipping_country,
                ]
                  .filter(Boolean)
                  .join(", ");

                const nextSteps = NEXT_STATUSES[statusKey] ?? [];

                const isCOD = ["cash_on_delivery", "pay_on_delivery"].includes(
                  (order.payment_method || "").toLowerCase()
                );
                const isUnpaid = (order.payment_status || "").toLowerCase() !== "paid";
                const showMarkPaid = (isBankTransferMethod(order.payment_method) || isCOD) && isUnpaid;

                return (
                  <div
                    key={order.id}
                    className="rounded-[22px] bg-white/85 border border-white/90 overflow-hidden shadow-sm"
                  >
                    {/* Header strip */}
                    <div className="bg-slate-900/90 text-white px-4 py-2.5 text-[11px]">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-wrap gap-4 md:gap-6">
                          <div>
                            <div className="font-semibold uppercase tracking-wide opacity-70">
                              Order placed
                            </div>
                            <div>{formatDate(order.created_at)}</div>
                          </div>

                          <div>
                            <div className="font-semibold uppercase tracking-wide opacity-70">
                              Total
                            </div>
                            <div>{formatMoney(order.total_cents)}</div>
                          </div>

                          <div>
                            <div className="font-semibold uppercase tracking-wide opacity-70">
                              Status
                            </div>
                            <div
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 border text-[11px]",
                                cfg.className
                              )}
                            >
                              <StatusIcon className="w-3.5 h-3.5" />
                              {cfg.label}
                            </div>
                          </div>

                          <div>
                            <div className="font-semibold uppercase tracking-wide opacity-70">
                              Payment
                            </div>
                            <div className="flex items-center gap-1.5">
                              {getPaymentMethodLabel(order.payment_method)}
                              <span
                                className={cn(
                                  "px-1.5 py-0.5 rounded-full text-[9px] font-bold",
                                  getPaymentStatusBadgeClass(order.payment_status, order.payment_method)
                                )}
                              >
                                {getPaymentStatusLabel(order.payment_status, order.payment_method)}
                              </span>
                            </div>
                          </div>

                          {order.estimated_delivery_date && (
                            <div>
                              <div className="font-semibold uppercase tracking-wide opacity-70">
                                Est. Delivery
                              </div>
                              <div className="flex items-center gap-1 text-lime-400">
                                <Truck className="w-3 h-3" />
                                {formatDate(order.estimated_delivery_date)}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="font-mono text-[10px] opacity-60">
                          #{order.id.slice(0, 8)}…
                        </div>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="px-4 py-4 md:px-5 md:py-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        {/* Left */}
                        <div className="flex-1 min-w-0 space-y-3">
                          <div className="flex items-start gap-3">
                            {firstItem?.image_url_snapshot ? (
                              <img
                                src={firstItem.image_url_snapshot}
                                alt={firstItem.name_snapshot || firstItem.name || "Product"}
                                className="w-11 h-11 rounded-2xl border border-slate-100 object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-2xl bg-white border border-slate-100 flex items-center justify-center text-2xl flex-shrink-0">
                                {firstItem?.emoji_snapshot || firstItem?.emoji || "🛍️"}
                              </div>
                            )}

                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {firstItem?.name_snapshot || firstItem?.name || "Order items"}
                              </div>
                              <div className="text-xs text-slate-500">
                                {itemsCount} item{itemsCount !== 1 ? "s" : ""}
                              </div>

                              <button
                                onClick={() => toggleExpand(order.id)}
                                className="mt-1 text-[11px] font-semibold text-blue-600 hover:underline"
                              >
                                {isExpanded ? "Hide details ▲" : "View details ▼"}
                              </button>
                            </div>
                          </div>

                          {/* Customer info */}
                          <div className="rounded-2xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-[11px] text-slate-700 max-w-sm space-y-1">
                            <div className="font-semibold text-slate-900">
                              {order.shipping_name || "Guest"}
                            </div>

                            {order.shipping_email && (
                              <div className="flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-slate-400" />
                                {order.shipping_email}
                              </div>
                            )}

                            {order.shipping_phone && (
                              <div className="flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-slate-400" />
                                {order.shipping_phone}
                              </div>
                            )}

                            {addressShort && (
                              <div className="flex items-start gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5" />
                                {addressShort}
                              </div>
                            )}
                          </div>

                          {/* Bank transfer */}
                          {isBankTransferMethod(order.payment_method) &&
                            isUnpaid &&
                            bankSettings?.bank_instructions && (
                              <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3 py-3 text-[11px] text-amber-900 max-w-sm space-y-1">
                                <div className="font-semibold">Bank transfer pending</div>
                                {bankSettings.bank_title && (
                                  <div>
                                    <span className="font-medium">Bank:</span>{" "}
                                    {bankSettings.bank_title}
                                  </div>
                                )}
                                <div className="whitespace-pre-wrap leading-relaxed">
                                  {bankSettings.bank_instructions}
                                </div>
                                <div className="font-semibold">
                                  Reference:{" "}
                                  <span className="font-mono">{order.id}</span>
                                </div>
                              </div>
                            )}

                          {/* Payment Actions */}
                          {isUnpaid && (
                            <div className="flex flex-col gap-2 max-w-sm">
                              {showMarkPaid && (
                                <button
                                  onClick={() => handleMarkPaymentPaid(order.id)}
                                  disabled={isUpdating}
                                  className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] disabled:opacity-50 transition-colors"
                                >
                                  {isUpdating ? "Updating…" : "✓ Quick mark as paid"}
                                </button>
                              )}
                              
                              {/* New: Record Payment with Details button */}
                              <button
                                onClick={() => openPaymentModal(order)}
                                disabled={isUpdating}
                                className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                              >
                                <Banknote className="w-3.5 h-3.5" />
                                Record Payment Details
                              </button>
                            </div>
                          )}

                          {order.shipping_notes && (
                            <div className="rounded-2xl bg-blue-50 border border-blue-200 px-3 py-2.5 text-[11px] text-blue-800 flex items-start gap-2 max-w-sm">
                              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold">Customer note:</span>{" "}
                                {order.shipping_notes}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right */}
                        <div className="flex flex-col items-end gap-3">
                          <div className="rounded-xl bg-white/80 border border-slate-100 px-4 py-3 text-right min-w-[160px] space-y-0.5">
                            <div className="text-[11px] text-slate-500">
                              Subtotal: {formatMoney(order.subtotal_cents)}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Tax: {formatMoney(order.tax_cents)}
                            </div>
                            <div className="text-sm font-bold text-slate-900">
                              Total: {formatMoney(order.total_cents)}
                            </div>

                            <div className="mt-1">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                                  getPaymentStatusBadgeClass(order.payment_status, order.payment_method)
                                )}
                              >
                                {getPaymentStatusLabel(order.payment_status, order.payment_method)}
                              </span>
                            </div>
                          </div>

                          {nextSteps.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 justify-end">
                              {nextSteps.map((s) => {
                                const scfg = STATUS_CONFIG[s];
                                return (
                                  <button
                                    key={s}
                                    onClick={() => handleUpdateOrderStatus(order.id, s)}
                                    disabled={isUpdating}
                                    className={cn(
                                      "px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all",
                                      s === "completed" &&
                                        "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700",
                                      s === "processing" &&
                                        "bg-sky-600 text-white border-sky-600 hover:bg-sky-700",
                                      s === "cancelled" &&
                                        "bg-white text-rose-700 border-rose-300 hover:bg-rose-50",
                                      s === "pending" &&
                                        "bg-white text-slate-700 border-slate-300 hover:bg-slate-50",
                                      isUpdating && "opacity-50 cursor-not-allowed"
                                    )}
                                  >
                                    {isUpdating ? (
                                      <Loader2 className="w-3 h-3 animate-spin inline" />
                                    ) : (
                                      `→ ${scfg.label}`
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {statusKey === "completed" && (
                            <div className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Order complete
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                          <TrackingPanel
                            orderId={order.id}
                            orderStatus={order.status}
                            estimatedDeliveryDate={order.estimated_delivery_date}
                          />

                          {/* Line items */}
                          {(() => {
                            const realItems: any[] = orderItemsMap[order.id] ?? [];
                            const sellers = orderSellersMap[order.id] ?? {};
                            // Use real order_items if fetched, otherwise fall back to snapshot
                            const displayItems = realItems.length > 0
                              ? realItems.map((ri) => ({
                                  image_url_snapshot: ri.image_url_snapshot,
                                  emoji_snapshot: ri.emoji_snapshot,
                                  name_snapshot: ri.name_snapshot,
                                  product_id: ri.product_id,
                                  seller_id: ri.seller_id,
                                  qty: ri.quantity,
                                  unit_price_cents: ri.price_snapshot_cents,
                                  line_total_cents: ri.line_total_cents,
                                  color_name: ri.color_name,
                                  size_label: ri.size_label,
                                }))
                              : items;

                            return (
                              <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden">
                                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[11px] font-semibold text-slate-700">
                                  <div className="col-span-6">Item</div>
                                  <div className="col-span-2 text-center">Qty</div>
                                  <div className="col-span-2 text-right">Unit price</div>
                                  <div className="col-span-2 text-right">Line total</div>
                                </div>

                                {displayItems.length === 0 ? (
                                  <div className="px-4 py-3 text-[11px] text-slate-500">
                                    No line item details stored.
                                  </div>
                                ) : (
                                  displayItems.map((item: any, idx: number) => {
                                    const unitCents = item.unit_price_cents ?? item.price_cents ?? null;
                                    const lineCents =
                                      item.line_total_cents ??
                                      (unitCents && item.qty ? unitCents * item.qty : null);
                                    const seller = item.seller_id ? sellers[item.seller_id] : null;

                                    return (
                                      <div
                                        key={idx}
                                        className="px-4 py-3 border-b border-slate-100 last:border-0 bg-white"
                                      >
                                        <div className="grid grid-cols-12 gap-2">
                                          <div className="col-span-6 flex items-start gap-2">
                                            {item.image_url_snapshot ? (
                                              <img
                                                src={item.image_url_snapshot}
                                                alt={item.name_snapshot || item.name || "Product"}
                                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                                              />
                                            ) : (
                                              <span className="text-xl leading-none mt-0.5">{item.emoji_snapshot || item.emoji || "📦"}</span>
                                            )}
                                            <div className="min-w-0">
                                              <div className="text-xs font-semibold text-slate-900 leading-tight">
                                                {item.name_snapshot || item.name}
                                              </div>
                                              {(item.color_name || item.size_label) && (
                                                <div className="text-[10px] text-slate-400 mt-0.5">
                                                  {[item.color_name, item.size_label].filter(Boolean).join(" · ")}
                                                </div>
                                              )}
                                              {item.kind === "approved_public" && (
                                                <div className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full inline-block mt-0.5">
                                                  PE price
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          <div className="col-span-2 text-center text-xs text-slate-700 self-center">
                                            {item.qty}
                                          </div>

                                          <div className="col-span-2 text-right text-xs text-slate-700 self-center">
                                            {unitCents ? (
                                              formatMoney(unitCents)
                                            ) : (
                                              <span className="text-slate-400">—</span>
                                            )}
                                          </div>

                                          <div className="col-span-2 text-right text-xs font-semibold text-slate-900 self-center">
                                            {lineCents ? (
                                              formatMoney(lineCents)
                                            ) : (
                                              <span className="text-slate-400">—</span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Seller info card */}
                                        {seller && (
                                          <div className="mt-2 ml-12 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                                            <div className="w-6 h-6 rounded-full bg-amber-200 flex items-center justify-center text-[10px] font-bold text-amber-800 flex-shrink-0">
                                              {(seller.display_name ?? seller.business_name ?? "S").charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                              <div className="text-[11px] font-semibold text-amber-900 truncate">
                                                {seller.display_name ?? seller.business_name ?? "Seller"}
                                                {seller.business_name && seller.display_name && seller.business_name !== seller.display_name && (
                                                  <span className="font-normal text-amber-700 ml-1">· {seller.business_name}</span>
                                                )}
                                              </div>
                                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                                                {seller.email && (
                                                  <span className="text-[10px] text-amber-700 flex items-center gap-0.5">
                                                    <Mail className="w-2.5 h-2.5" />{seller.email}
                                                  </span>
                                                )}
                                                {seller.phone && (
                                                  <span className="text-[10px] text-amber-700 flex items-center gap-0.5">
                                                    <Phone className="w-2.5 h-2.5" />{seller.phone}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })
                                )}

                                <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-slate-50 border-t border-slate-100">
                                  <div className="col-span-8 text-right text-[11px] font-semibold text-slate-700">
                                    Order total:
                                  </div>
                                  <div className="col-span-4 text-right text-sm font-bold text-slate-900">
                                    {formatMoney(order.total_cents)}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Shipping + payment detail */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-2xl bg-white border border-slate-100 p-4">
                              <h3 className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                                <Truck className="w-4 h-4" /> Shipping address
                              </h3>

                              <div className="text-[11px] text-slate-700 space-y-0.5">
                                <p className="font-semibold">{order.shipping_name}</p>
                                {order.shipping_address_line1 && <p>{order.shipping_address_line1}</p>}
                                {order.shipping_address_line2 && <p>{order.shipping_address_line2}</p>}
                                <p>
                                  {[order.shipping_city, order.shipping_state, order.shipping_postal_code]
                                    .filter(Boolean)
                                    .join(", ")}
                                </p>
                                {order.shipping_country && <p>{order.shipping_country}</p>}
                              </div>
                            </div>

                            <div className="rounded-2xl bg-white border border-slate-100 p-4">
                              <h3 className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-1.5">
                                <CreditCard className="w-4 h-4" /> Payment
                              </h3>

                              <div className="text-[11px] text-slate-700 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span>Method</span>
                                  <span className="font-semibold">
                                    {getPaymentMethodLabel(order.payment_method)}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between">
                                  <span>Status</span>
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                                      getPaymentStatusBadgeClass(order.payment_status, order.payment_method)
                                    )}
                                  >
                                    {getPaymentStatusLabel(order.payment_status, order.payment_method)}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between">
                                  <span>Placed</span>
                                  <span className="font-medium">{formatDateTimeLong(order.created_at)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Sidebar — product approvals */}
          <div className="space-y-4">
            <div className="glass glass-card glass-ring rounded-[22px] overflow-hidden">
              <div className="bg-slate-900/90 text-white px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  <span className="text-sm font-semibold">Pending approvals</span>
                </div>

                {pendingApprovals.length > 0 && (
                  <span className="text-[11px] bg-amber-500 px-2 py-0.5 rounded-full font-bold">
                    {pendingApprovals.length}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="px-4 py-6 text-xs text-slate-500 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : pendingApprovals.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <CheckCircle className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">All submissions reviewed.</p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-slate-100">
                    {visibleApprovals.map((product) => (
                      <div key={product.id} className="px-4 py-4 space-y-3 text-xs">
                        <div className="flex items-start gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-lg flex-shrink-0">
                            {product.emoji || "📦"}
                          </div>

                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">{product.name}</div>
                            {product.description && (
                              <div className="text-[11px] text-slate-400 truncate">
                                {product.description}
                              </div>
                            )}
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Seller asked:{" "}
                              <span className="font-semibold text-slate-700">
                                {formatMoney(product.seller_price_cents)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            Your final price (ETB)
                          </label>

                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={priceInputs[product.id] || ""}
                              onChange={(e) => {
                                setPriceInputs((prev) => ({ ...prev, [product.id]: e.target.value }));
                                setPriceErrors((prev) => ({ ...prev, [product.id]: "" }));
                              }}
                              className="flex-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-400/40 focus:border-cyan-400"
                              placeholder="e.g. 1500.00"
                            />

                            <button
                              onClick={() => handleSavePrice(product.id)}
                              disabled={savingId === product.id}
                              className="rounded-full bg-slate-900 text-white px-3 py-1.5 text-[11px] font-bold disabled:opacity-50"
                            >
                              Save
                            </button>
                          </div>

                          {priceErrors[product.id] && (
                            <p className="text-[10px] text-rose-600 font-semibold">
                              {priceErrors[product.id]}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(product.id)}
                            disabled={savingId === product.id}
                            className="flex-1 py-2 rounded-full bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                          >
                            {savingId === product.id ? "…" : "✓ Approve"}
                          </button>

                          <button
                            onClick={() => handleReject(product.id)}
                            disabled={savingId === product.id}
                            className="flex-1 py-2 rounded-full bg-white border border-slate-300 text-slate-700 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-50 transition-colors"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {hiddenApprovalCount > 0 && (
                    <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
                      <button
                        onClick={() => router.push("/admin/products")}
                        className="w-full flex items-center justify-between text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                      >
                        <span>+{hiddenApprovalCount} more pending</span>
                        <div className="flex items-center gap-1">
                          View all <ArrowRight className="w-3.5 h-3.5" />
                        </div>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}