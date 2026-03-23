// app/admin/returns/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft, RefreshCw, PackageOpen, CheckCircle2, XCircle,
  Clock, Search, ChevronDown, ChevronUp, MessageSquare,
  AlertCircle, Loader2, DollarSign, RotateCcw, User,
  Calendar, Hash, MapPin, Package, BadgeCheck, Ban,
  Banknote, FileText, X, Filter,
} from "lucide-react";

/* ─── Types ─── */
type ReturnStatus = "pending" | "reviewing" | "approved" | "refunded" | "rejected";

type ReturnRequest = {
  id: string;
  order_id: string;
  user_id: string;
  reason: string;
  status: ReturnStatus;
  admin_notes: string | null;
  refund_amount_cents: number | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  order?: {
    id: string;
    total_cents: number;
    created_at: string;
    status: string;
    shipping_name: string | null;
    shipping_email: string | null;
    shipping_phone: string | null;
    shipping_city: string | null;
    shipping_region: string | null;
    payment_method: string | null;
  };
  items?: {
    id: string;
    name_snapshot: string;
    emoji_snapshot: string | null;
    image_url_snapshot: string | null;
    quantity: number;
    line_total_cents: number;
  }[];
};

/* ─── Status config ─── */
const STATUS_CONFIG: Record<ReturnStatus, { label: string; color: string; bg: string; dot: string; icon: any }> = {
  pending:   { label: "Pending Review", color: "#92400e", bg: "#fef3c7", dot: "#f59e0b", icon: Clock },
  reviewing: { label: "Under Review",   color: "#1e40af", bg: "#dbeafe", dot: "#3b82f6", icon: Search },
  approved:  { label: "Approved",       color: "#14532d", bg: "#dcfce7", dot: "#22c55e", icon: CheckCircle2 },
  refunded:  { label: "Refunded",       color: "#1e3a5f", bg: "#e0f2fe", dot: "#0ea5e9", icon: Banknote },
  rejected:  { label: "Rejected",       color: "#7f1d1d", bg: "#fee2e2", dot: "#ef4444", icon: XCircle },
};

const STATUS_FLOW: Record<ReturnStatus, ReturnStatus[]> = {
  pending:   ["reviewing", "rejected"],
  reviewing: ["approved", "rejected"],
  approved:  ["refunded"],
  refunded:  [],
  rejected:  [],
};

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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ─── Decision Modal ─── */
function DecisionModal({
  request,
  action,
  onConfirm,
  onClose,
  loading,
}: {
  request: ReturnRequest;
  action: ReturnStatus;
  onConfirm: (notes: string, refundCents: number | null) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const [notes, setNotes] = useState("");
  const [refundInput, setRefundInput] = useState(
    action === "approved" || action === "refunded"
      ? request.order?.total_cents ? (request.order.total_cents / 100).toFixed(2) : ""
      : ""
  );

  const cfg = STATUS_CONFIG[action];
  const Icon = cfg.icon;

  const needsRefund = action === "approved" || action === "refunded";

  const refundCents = needsRefund && refundInput
    ? Math.round(parseFloat(refundInput) * 100)
    : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 520, margin: "0 auto", padding: "24px 20px 44px", boxShadow: "0 -8px 40px rgba(0,0,0,0.2)", maxHeight: "85svh", overflowY: "auto" }}>

        <div style={{ width: 36, height: 4, background: "#e5e7eb", borderRadius: 99, margin: "0 auto 20px" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon size={20} color={cfg.color} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>
                {action === "reviewing" ? "Move to Review" :
                 action === "approved" ? "Approve Return" :
                 action === "refunded" ? "Mark as Refunded" :
                 "Reject Return"}
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>Return #{shortId(request.id)}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", display: "flex" }}>
            <X size={16} color="#64748b" />
          </button>
        </div>

        {/* Order summary */}
        <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px", marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Order Summary</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "#64748b" }}>Customer</span>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>{request.order?.shipping_name || "Unknown"}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "#64748b" }}>Order total</span>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>{money(request.order?.total_cents)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
            <span style={{ color: "#64748b" }}>Reason</span>
            <span style={{ fontWeight: 600, color: "#0f172a", textAlign: "right", maxWidth: "60%" }}>{request.reason}</span>
          </div>
        </div>

        {/* Refund amount — only for approve/refund */}
        {needsRefund && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
              Refund Amount (ETB) *
            </label>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: "#64748b" }}>ETB</span>
              <input
                type="number" step="0.01" min="0"
                value={refundInput}
                onChange={(e) => setRefundInput(e.target.value)}
                placeholder="0.00"
                style={{ width: "100%", padding: "11px 14px 11px 52px", borderRadius: 12, border: "1.5px solid #e5e7eb", fontSize: 14, fontWeight: 700, fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#0f172a" }}
              />
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
              Full order value: {money(request.order?.total_cents)}
            </div>
          </div>
        )}

        {/* Admin notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
            {action === "rejected" ? "Rejection Reason *" : "Admin Notes"}
            {action !== "rejected" && <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 4 }}>(optional)</span>}
          </label>
          <textarea
            placeholder={
              action === "rejected" ? "Explain why this return is being rejected…" :
              action === "approved" ? "Any instructions for the customer regarding the return…" :
              action === "refunded" ? "Refund reference number or confirmation…" :
              "Notes about this review…"
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ width: "100%", borderRadius: 12, border: "1.5px solid #e5e7eb", padding: "10px 14px", fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box", color: "#0f172a" }}
          />
        </div>

        {/* CTA */}
        <button
          disabled={loading || (action === "rejected" && !notes.trim()) || (needsRefund && !refundInput)}
          onClick={() => onConfirm(notes.trim(), refundCents)}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
            background: loading || (action === "rejected" && !notes.trim()) || (needsRefund && !refundInput)
              ? "#e5e7eb"
              : action === "rejected" ? "#dc2626"
              : action === "approved" ? "#16a34a"
              : action === "refunded" ? "#0ea5e9"
              : "#0f172a",
            color: loading || (action === "rejected" && !notes.trim()) || (needsRefund && !refundInput) ? "#9ca3af" : "#fff",
            fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {loading ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Processing…</> :
           action === "reviewing" ? <><Search size={16} /> Start Review</> :
           action === "approved" ? <><CheckCircle2 size={16} /> Approve Return</> :
           action === "refunded" ? <><Banknote size={16} /> Confirm Refund</> :
           <><XCircle size={16} /> Reject Return</>}
        </button>
      </div>
    </div>
  );
}

/* ─── Return Card ─── */
function ReturnCard({
  request,
  expanded,
  onToggle,
  onDecision,
}: {
  request: ReturnRequest;
  expanded: boolean;
  onToggle: () => void;
  onDecision: (action: ReturnStatus) => void;
}) {
  const cfg = STATUS_CONFIG[request.status];
  const Icon = cfg.icon;
  const nextActions = STATUS_FLOW[request.status];
  const isTerminal = nextActions.length === 0;

  return (
    <div style={{ background: "#fff", borderRadius: 20, overflow: "hidden", border: "1px solid #f1f5f9", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>

      {/* Top bar — clickable */}
      <button
        onClick={onToggle}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", textAlign: "left" }}
      >
        <div style={{ background: "#0f172a", padding: "11px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PackageOpen size={13} color="rgba(255,255,255,0.5)" />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>Return Request</span>
            <span style={{ color: "rgba(255,255,255,0.2)" }}>·</span>
            <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.5)" }}>#{shortId(request.id)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{timeAgo(request.created_at)}</span>
            {expanded ? <ChevronUp size={14} color="rgba(255,255,255,0.4)" /> : <ChevronDown size={14} color="rgba(255,255,255,0.4)" />}
          </div>
        </div>

        {/* Status + reason preview */}
        <div style={{ padding: "10px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
            {cfg.label}
          </span>
          {request.order?.shipping_city && (
            <span style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
              <MapPin size={10} /> {request.order.shipping_city}
            </span>
          )}
        </div>

        {/* Customer + order preview */}
        <div style={{ padding: "10px 16px 14px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <User size={18} color="#64748b" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
              {request.order?.shipping_name || "Unknown customer"}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {request.reason}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>{money(request.order?.total_cents)}</div>
            <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>order value</div>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: "1px solid #f8fafc" }}>

          {/* Items */}
          {request.items && request.items.length > 0 && (
            <div style={{ padding: "14px 16px 0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Items in Order</div>
              <div style={{ background: "#f8fafc", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
                {request.items.map((it, idx) => (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: idx < (request.items?.length ?? 0) - 1 ? "1px solid #f1f5f9" : "none" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#fff", border: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, overflow: "hidden", flexShrink: 0 }}>
                      {it.image_url_snapshot
                        ? <img src={it.image_url_snapshot} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : (it.emoji_snapshot || "📦")}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name_snapshot}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Qty {it.quantity}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", flexShrink: 0 }}>{money(it.line_total_cents)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order + customer details */}
          <div style={{ padding: "0 16px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Customer</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 3 }}>{request.order?.shipping_name || "—"}</div>
              {request.order?.shipping_email && <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>{request.order.shipping_email}</div>}
              {request.order?.shipping_phone && <div style={{ fontSize: 11, color: "#64748b" }}>{request.order.shipping_phone}</div>}
            </div>
            <div style={{ background: "#f8fafc", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Order</div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>#{shortId(request.order_id)}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginBottom: 3 }}>Placed {request.order?.created_at ? formatDate(request.order.created_at) : "—"}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{money(request.order?.total_cents)}</div>
            </div>
          </div>

          {/* Reason detail */}
          <div style={{ margin: "0 16px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>Return Reason</div>
            <div style={{ fontSize: 13, color: "#78350f", fontWeight: 500 }}>{request.reason}</div>
            <div style={{ fontSize: 11, color: "#a16207", marginTop: 4 }}>Submitted {formatDateTime(request.created_at)}</div>
          </div>

          {/* Admin notes (if any) */}
          {request.admin_notes && (
            <div style={{ margin: "0 16px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#14532d", marginBottom: 4 }}>Admin Notes</div>
              <div style={{ fontSize: 12, color: "#166534" }}>{request.admin_notes}</div>
              {request.reviewed_at && <div style={{ fontSize: 11, color: "#4ade80", marginTop: 4 }}>Reviewed {formatDateTime(request.reviewed_at)}</div>}
            </div>
          )}

          {/* Refund amount (if set) */}
          {request.refund_amount_cents && (
            <div style={{ margin: "0 16px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1e40af" }}>Refund Amount</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#1d4ed8" }}>{money(request.refund_amount_cents)}</div>
            </div>
          )}

          {/* Action buttons */}
          {!isTerminal && (
            <div style={{ padding: "0 16px 16px", display: "flex", gap: 8, flexWrap: "wrap" }}>
              {nextActions.map((action) => {
                const acfg = STATUS_CONFIG[action];
                const AIcon = acfg.icon;
                const isDestructive = action === "rejected";
                const isPositive = action === "approved" || action === "refunded";

                return (
                  <button
                    key={action}
                    onClick={() => onDecision(action)}
                    style={{
                      flex: 1, minWidth: 100, padding: "11px 0", borderRadius: 12,
                      border: isDestructive ? "1px solid #fecaca" : isPositive ? "none" : "1px solid #e5e7eb",
                      background: isDestructive ? "#fef2f2" : isPositive ? "#0f172a" : "#f8fafc",
                      color: isDestructive ? "#dc2626" : isPositive ? "#fff" : "#475569",
                      fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    }}
                  >
                    <AIcon size={14} />
                    {action === "reviewing" ? "Start Review" :
                     action === "approved" ? "Approve" :
                     action === "refunded" ? "Mark Refunded" :
                     "Reject"}
                  </button>
                );
              })}
            </div>
          )}

          {/* Terminal state badge */}
          {isTerminal && (
            <div style={{ padding: "0 16px 16px" }}>
              <div style={{ background: cfg.bg, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                <Icon size={16} color={cfg.color} />
                <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>
                  {request.status === "refunded" ? "Refund issued — case closed" : "Return rejected — case closed"}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Stats Card ─── */
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", border: "1px solid #f1f5f9", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

/* ─── Main Page ─── */
export default function AdminReturnsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ReturnStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [decisionModal, setDecisionModal] = useState<{ request: ReturnRequest; action: ReturnStatus } | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const loadReturns = useCallback(async () => {
    try {
      const { data: returnData, error } = await supabase
        .from("return_requests")
        .select("id, order_id, user_id, reason, status, admin_notes, refund_amount_cents, created_at, reviewed_at, reviewed_by")
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!returnData?.length) { setReturns([]); return; }

      const orderIds = [...new Set(returnData.map((r: any) => r.order_id))];

      const [ordersRes, itemsRes] = await Promise.all([
        supabase.from("orders")
          .select("id, total_cents, created_at, status, shipping_name, shipping_email, shipping_phone, shipping_city, shipping_region, payment_method")
          .in("id", orderIds),
        supabase.from("order_items")
          .select("id, order_id, name_snapshot, emoji_snapshot, image_url_snapshot, quantity, line_total_cents")
          .in("order_id", orderIds),
      ]);

      const ordersById: Record<string, any> = {};
      for (const o of ordersRes.data ?? []) ordersById[o.id] = o;

      const itemsByOrder: Record<string, any[]> = {};
      for (const it of itemsRes.data ?? []) {
        if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
        itemsByOrder[it.order_id].push(it);
      }

      const built: ReturnRequest[] = returnData.map((r: any) => ({
        id: r.id, order_id: r.order_id, user_id: r.user_id,
        reason: r.reason, status: r.status,
        admin_notes: r.admin_notes ?? null,
        refund_amount_cents: r.refund_amount_cents ?? null,
        created_at: r.created_at,
        reviewed_at: r.reviewed_at ?? null,
        reviewed_by: r.reviewed_by ?? null,
        order: ordersById[r.order_id] ?? undefined,
        items: itemsByOrder[r.order_id] ?? [],
      }));

      setReturns(built);

      // Auto-expand first pending
      const firstPending = built.find((r) => r.status === "pending");
      if (firstPending) setExpandedId(firstPending.id);

    } catch (err) {
      console.error("[admin returns] load error:", err);
      showToast("Failed to load returns.", false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/auth/login"); return; }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/auth/login"); return; }

      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (profile?.role !== "admin") { router.replace("/"); return; }

      setAdminId(user.id);
      await loadReturns();
      setLoading(false);
    }
    init();
  }, [loadReturns, router]);

  const stats = useMemo(() => ({
    total: returns.length,
    pending: returns.filter((r) => r.status === "pending").length,
    reviewing: returns.filter((r) => r.status === "reviewing").length,
    approved: returns.filter((r) => r.status === "approved").length,
    refunded: returns.filter((r) => r.status === "refunded").length,
    rejected: returns.filter((r) => r.status === "rejected").length,
    totalRefundedCents: returns.filter((r) => r.status === "refunded").reduce((sum, r) => sum + (r.refund_amount_cents ?? 0), 0),
  }), [returns]);

  const filtered = useMemo(() => {
    let list = activeFilter === "all" ? returns : returns.filter((r) => r.status === activeFilter);
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      shortId(r.id).toLowerCase().includes(q) ||
      (r.order?.shipping_name ?? "").toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q) ||
      shortId(r.order_id).toLowerCase().includes(q)
    );
  }, [returns, activeFilter, search]);

  async function handleDecisionConfirm(notes: string, refundCents: number | null) {
    if (!decisionModal || !adminId) return;
    const { request, action } = decisionModal;

    try {
      setActingOn(request.id);
      const { error } = await supabase.from("return_requests").update({
        status: action,
        admin_notes: notes || null,
        refund_amount_cents: refundCents,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminId,
      }).eq("id", request.id);

      if (error) throw error;

      setReturns((prev) => prev.map((r) => r.id === request.id ? {
        ...r, status: action,
        admin_notes: notes || null,
        refund_amount_cents: refundCents,
        reviewed_at: new Date().toISOString(),
      } : r));

      showToast(
        action === "rejected" ? "Return rejected." :
        action === "approved" ? "Return approved — notify customer." :
        action === "refunded" ? "Refund marked. Case closed." :
        "Status updated."
      );
      setDecisionModal(null);
    } catch (err: any) {
      showToast(err?.message ?? "Failed to update.", false);
    } finally {
      setActingOn(null);
    }
  }

  const filters: { key: ReturnStatus | "all"; label: string; count: number }[] = [
    { key: "all",       label: "All",       count: stats.total },
    { key: "pending",   label: "Pending",   count: stats.pending },
    { key: "reviewing", label: "Reviewing", count: stats.reviewing },
    { key: "approved",  label: "Approved",  count: stats.approved },
    { key: "refunded",  label: "Refunded",  count: stats.refunded },
    { key: "rejected",  label: "Rejected",  count: stats.rejected },
  ];

  return (
    <main style={{ minHeight: "100svh", background: "#f5f5f5", paddingBottom: 40 }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 200, background: toast.ok ? "#0f172a" : "#dc2626", color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: "0 8px 24px rgba(0,0,0,0.22)", whiteSpace: "nowrap", pointerEvents: "none" }}>
          {toast.msg}
        </div>
      )}

      {/* Decision modal */}
      {decisionModal && (
        <DecisionModal
          request={decisionModal.request}
          action={decisionModal.action}
          onConfirm={handleDecisionConfirm}
          onClose={() => setDecisionModal(null)}
          loading={actingOn === decisionModal.request.id}
        />
      )}

      {/* Header */}
      <div style={{ background: "#0f172a", padding: "20px 20px 0" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={() => router.push("/admin")} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                <ArrowLeft size={14} /> Admin
              </button>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>Returns</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>{stats.total} total · {stats.pending} need action</div>
              </div>
            </div>
            <button onClick={loadReturns} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 10, padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Pending",  value: stats.pending,  color: "#f59e0b" },
              { label: "Open",     value: stats.pending + stats.reviewing, color: "#3b82f6" },
              { label: "Refunded", value: stats.refunded, color: "#22c55e" },
              { label: "Total ETB refunded", value: stats.totalRefundedCents > 0 ? `${(stats.totalRefundedCents / 100 / 1000).toFixed(1)}K` : "0", color: "#0ea5e9" },
            ].map((s) => (
              <div key={s.label} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 14 }}>
            <Search size={14} color="rgba(255,255,255,0.3)" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
            <input
              type="text" placeholder="Search by customer, return ID, order ID, reason…"
              value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", padding: "10px 14px 10px 36px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.07)", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box", color: "#fff" }}
            />
          </div>

          {/* Filter pills */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 16 }}>
            {filters.map((f) => {
              const on = activeFilter === f.key;
              return (
                <button key={f.key} onClick={() => setActiveFilter(f.key)} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 999, border: on ? "none" : "1px solid rgba(255,255,255,0.15)", background: on ? "#fff" : "transparent", color: on ? "#0f172a" : "rgba(255,255,255,0.55)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
                  {f.label}
                  {f.count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 800, background: on ? "#0f172a" : "rgba(255,255,255,0.15)", color: on ? "#fff" : "rgba(255,255,255,0.7)", padding: "1px 6px", borderRadius: 999 }}>{f.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px" }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 20, overflow: "hidden", border: "1px solid #f1f5f9" }}>
                <div style={{ height: 48, background: "#e5e7eb" }} />
                <div style={{ padding: 16 }}>
                  <div style={{ height: 12, background: "#f1f5f9", borderRadius: 6, width: "45%", marginBottom: 8 }} />
                  <div style={{ height: 10, background: "#f1f5f9", borderRadius: 6, width: "70%" }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ background: "#fff", borderRadius: 20, padding: "52px 24px", textAlign: "center", border: "1px solid #f1f5f9" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
              {search ? "No results found" : activeFilter === "all" ? "No return requests yet" : `No ${activeFilter} returns`}
            </div>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              {search ? "Try a different search term." : "Return requests from customers will appear here."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Pending alert banner */}
            {stats.pending > 0 && activeFilter === "all" && (
              <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 14, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                <AlertCircle size={18} color="#d97706" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>
                  {stats.pending} return{stats.pending !== 1 ? "s" : ""} awaiting your review
                </div>
              </div>
            )}

            {filtered.map((request) => (
              <ReturnCard
                key={request.id}
                request={request}
                expanded={expandedId === request.id}
                onToggle={() => setExpandedId(expandedId === request.id ? null : request.id)}
                onDecision={(action) => setDecisionModal({ request, action })}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
