// app/admin/business/page.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Phone,
  RotateCcw,
  Search,
  Shield,
  Truck,
  User,
  X,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════════════ */

type AppStatus = "pending" | "approved" | "rejected";

type BusinessApp = {
  id: string;
  user_id: string;
  org_name: string;
  org_type: string;
  tin_number: string | null;
  contact_name: string;
  contact_phone: string | null;
  office_address: string;
  estimated_monthly_spend_cents: number | null;
  preferred_payment_terms: "net_30" | "net_60";
  document_url: string | null;
  status: AppStatus;
  approved_credit_limit_cents: number | null;
  payment_terms: "net_30" | "net_60" | null;
  admin_notes: string | null;
  reviewer_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  // joined
  profile_email?: string | null;
  profile_name?: string | null;
};

type FilterStatus = "all" | AppStatus;

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

function formatTerms(t: "net_30" | "net_60" | null | undefined): string {
  if (t === "net_30") return "Net-30";
  if (t === "net_60") return "Net-60";
  return "—";
}

function statusBadge(status: AppStatus) {
  if (status === "approved")
    return {
      bg: "#f0fdf4",
      text: "#166534",
      border: "#bbf7d0",
      label: "Approved",
      icon: Check,
    };
  if (status === "rejected")
    return {
      bg: "#fff1f2",
      text: "#9f1239",
      border: "#fecdd3",
      label: "Rejected",
      icon: X,
    };
  return {
    bg: "#fffbeb",
    text: "#92400e",
    border: "#fde68a",
    label: "Pending",
    icon: Clock,
  };
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   STAT CARD COMPONENT
══════════════════════════════════════════════════════════════════════════════ */

function StatCard({
  label,
  value,
  color,
  icon: Icon,
  trend,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ElementType;
  trend?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {trend && (
          <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600">
            {trend}
          </span>
        )}
      </div>
      <div className="text-3xl font-black text-slate-900 mb-1">{value}</div>
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   APPLICATION CARD (accordion) — COMPACT PROFESSIONAL DESIGN
══════════════════════════════════════════════════════════════════════════════ */

function ApplicationCard({
  app,
  adminId,
  onRefresh,
}: {
  app: BusinessApp;
  adminId: string;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [creditLimitInput, setCreditLimitInput] = useState(
    app.approved_credit_limit_cents
      ? String(Math.round(app.approved_credit_limit_cents / 100))
      : "",
  );
  const [paymentTerms, setPaymentTerms] = useState<"net_30" | "net_60">(
    app.payment_terms ?? app.preferred_payment_terms ?? "net_30",
  );
  const [adminNotes, setAdminNotes] = useState(app.admin_notes ?? "");
  const [reviewerNotes, setReviewerNotes] = useState(app.reviewer_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badge = statusBadge(app.status);
  const StatusIcon = badge.icon;

  // APPROVE HANDLER — with profiles sync
  async function handleApprove() {
    setError(null);
    const limit = parseFloat(creditLimitInput.replace(/,/g, ""));
    if (!creditLimitInput.trim() || isNaN(limit) || limit <= 0) {
      setError("Please enter a valid credit limit in ETB before approving.");
      return;
    }

    setSaving(true);
    try {
      const creditLimitCents = Math.round(limit * 100);
      const now = new Date().toISOString();

      // 1. Update the application status
      const { error: appError } = await supabase
        .from("business_applications")
        .update({
          status: "approved",
          approved_credit_limit_cents: creditLimitCents,
          payment_terms: paymentTerms,
          admin_notes: adminNotes.trim() || null,
          reviewer_notes: reviewerNotes.trim() || null,
          reviewed_at: now,
          reviewed_by: adminId,
        })
        .eq("id", app.id);

      if (appError) throw appError;

      // 2. Sync to profiles (business account activation)
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          is_business_account: true,
          business_credit_limit_cents: creditLimitCents,
          business_credit_used_cents: 0,
          business_payment_terms: paymentTerms,
          business_org_name: app.org_name,
        })
        .eq("id", app.user_id);

      if (profileError) throw profileError;

      onRefresh();
    } catch (err: any) {
      console.error("[admin business] approve error:", err);
      setError(err?.message ?? "Failed to approve. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    setError(null);
    setSaving(true);
    try {
      const now = new Date().toISOString();

      const { error: appErr } = await supabase
        .from("business_applications")
        .update({
          status: "rejected",
          admin_notes: adminNotes.trim() || null,
          reviewer_notes: reviewerNotes.trim() || null,
          reviewed_at: now,
          reviewed_by: adminId,
        })
        .eq("id", app.id);

      if (appErr) throw new Error(appErr.message);

      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          is_business_account: false,
          business_credit_limit_cents: null,
          business_credit_used_cents: 0,
          business_payment_terms: null,
          business_org_name: null,
        })
        .eq("id", app.user_id);

      if (profErr) throw new Error(profErr.message);

      onRefresh();
    } catch (err: any) {
      console.error("[admin business] reject error:", err);
      setError(err?.message ?? "Failed to reject. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevert() {
    setError(null);
    setSaving(true);
    try {
      const now = new Date().toISOString();

      const { error: appErr } = await supabase
        .from("business_applications")
        .update({
          status: "pending",
          approved_credit_limit_cents: null,
          payment_terms: null,
          admin_notes: adminNotes.trim() || null,
          reviewer_notes: null,
          reviewed_at: now,
          reviewed_by: adminId,
        })
        .eq("id", app.id);

      if (appErr) throw new Error(appErr.message);

      const { error: profErr } = await supabase
        .from("profiles")
        .update({
          is_business_account: false,
          business_credit_limit_cents: null,
          business_credit_used_cents: 0,
          business_payment_terms: null,
          business_org_name: null,
        })
        .eq("id", app.user_id);

      if (profErr) throw new Error(profErr.message);

      onRefresh();
    } catch (err: any) {
      console.error("[admin business] revert error:", err);
      setError(err?.message ?? "Failed to revert. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    setError(null);
    setSaving(true);
    try {
      const { error: appErr } = await supabase
        .from("business_applications")
        .update({
          admin_notes: adminNotes.trim() || null,
          reviewer_notes: reviewerNotes.trim() || null,
        })
        .eq("id", app.id);
      if (appErr) throw new Error(appErr.message);
      onRefresh();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save notes.");
    } finally {
      setSaving(false);
    }
  }

  const orgIcon = app.org_type.includes("Government")
    ? "🏛️"
    : app.org_type.includes("Embassy")
    ? "🌍"
    : app.org_type.includes("NGO")
    ? "🤝"
    : app.org_type.includes("University") || app.org_type.includes("School")
    ? "🏫"
    : app.org_type.includes("Hospital") || app.org_type.includes("Clinic")
    ? "🏥"
    : "🏢";

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Header row — compact professional */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors"
      >
        {/* Status indicator */}
        <div
          className="w-2 h-12 rounded-full flex-shrink-0"
          style={{ background: badge.text }}
        />

        {/* Org icon */}
        <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-xl bg-slate-100 border border-slate-200">
          {orgIcon}
        </div>

        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          {/* Org name & type */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-900 truncate">
                {app.org_name}
              </span>
              <span
                className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border flex-shrink-0"
                style={{
                  background: badge.bg,
                  color: badge.text,
                  borderColor: badge.border,
                }}
              >
                {badge.label}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-slate-500 font-medium">
                {app.org_type}
              </span>
              {app.tin_number && (
                <span className="text-xs text-slate-400">
                  TIN: {app.tin_number}
                </span>
              )}
            </div>
          </div>

          {/* Contact */}
          <div className="hidden md:block">
            <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-0.5">
              <User className="w-3 h-3 text-slate-400" />
              <span className="truncate">{app.contact_name}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Phone className="w-3 h-3 text-slate-400" />
              <span className="truncate">{app.contact_phone || "—"}</span>
            </div>
          </div>

          {/* Meta */}
          <div className="hidden md:flex flex-col items-end text-right">
            <span className="text-xs font-semibold text-slate-900">
              {relativeDate(app.created_at)}
            </span>
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
              {app.estimated_monthly_spend_cents
                ? money(app.estimated_monthly_spend_cents) + "/mo"
                : "No estimate"}
            </span>
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center gap-2">
          {app.status === "pending" && (
            <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              Action Required
            </span>
          )}
          {open ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </div>
      </button>

      {/* Expanded panel — reorganized */}
      {open && (
        <div className="border-t border-slate-200 bg-slate-50/50 px-5 pb-6 pt-5 space-y-5">
          {/* Quick info grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Organization Details */}
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                <Building2 className="w-3 h-3" />
                Organization
              </h4>
              <div className="space-y-2.5">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Name
                  </span>
                  <p className="text-sm font-semibold text-slate-900">
                    {app.org_name}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Type
                  </span>
                  <p className="text-sm font-semibold text-slate-900">
                    {app.org_type}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    TIN / Registration
                  </span>
                  <p className="text-sm font-semibold text-slate-900">
                    {app.tin_number || "Not provided"}
                  </p>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                <User className="w-3 h-3" />
                Contact
              </h4>
              <div className="space-y-2.5">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Contact Person
                  </span>
                  <p className="text-sm font-semibold text-slate-900">
                    {app.contact_name}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Phone
                  </span>
                  <p className="text-sm font-semibold text-slate-900">
                    {app.contact_phone || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Email
                  </span>
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {app.profile_email || "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Financial Request */}
            <div className="bg-white rounded-xl p-4 border border-slate-200">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                <Shield className="w-3 h-3" />
                Financial Request
              </h4>
              <div className="space-y-2.5">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Monthly Estimate
                  </span>
                  <p className="text-sm font-semibold text-slate-900">
                    {app.estimated_monthly_spend_cents
                      ? money(app.estimated_monthly_spend_cents)
                      : "Not provided"}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Preferred Terms
                  </span>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatTerms(app.preferred_payment_terms)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Applied On
                  </span>
                  <p className="text-sm font-semibold text-slate-900">
                    {new Date(app.created_at).toLocaleDateString("en-US", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Address — Compact */}
          <div className="bg-slate-900 rounded-xl p-4 flex items-start gap-3">
            <MapPin className="w-4 h-4 text-lime-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-[10px] font-black text-lime-400 uppercase tracking-wider mb-0.5">
                Delivery Address
              </div>
              <div className="text-sm font-medium text-white">
                {app.office_address}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <Truck className="w-3 h-3" />
                1–3 Business Days
              </div>
            </div>
          </div>

          {/* Document Preview */}
          {app.document_url && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                  <FileText className="w-3 h-3" />
                  Submitted Document
                </h4>
                <a
                  href={app.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  Open →
                </a>
              </div>
              {app.document_url.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
                <img
                  src={app.document_url}
                  alt="Business document"
                  className="max-h-[240px] w-full object-contain p-4 bg-slate-50"
                />
              ) : (
                <div className="flex items-center justify-between p-4 bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        Business Document (PDF)
                      </p>
                      <p className="text-xs text-slate-400">
                        Click to view in new tab
                      </p>
                    </div>
                  </div>
                  <a
                    href={app.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                  >
                    View
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Admin Decision Panel */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                Review Decision
              </h4>
              {app.status !== "pending" && (
                <span
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                    app.status === "approved"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }`}
                >
                  {app.status === "approved" ? "Approved" : "Rejected"} on{" "}
                  {app.reviewed_at
                    ? new Date(app.reviewed_at).toLocaleDateString()
                    : "—"}
                </span>
              )}
            </div>

            {/* Credit Limit */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                Approved Credit Limit (ETB){" "}
                {app.status === "pending" && (
                  <span className="text-red-500">*</span>
                )}
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                    ETB
                  </span>
                  <input
                    type="number"
                    value={creditLimitInput}
                    onChange={(e) => setCreditLimitInput(e.target.value)}
                    placeholder="e.g. 500000"
                    className="w-full pl-12 pr-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-900 focus:outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 focus:bg-white transition-all"
                  />
                </div>
                <div className="flex gap-2">
                  {[50000, 100000, 250000, 500000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setCreditLimitInput(String(v))}
                      className="px-3 py-2 rounded-lg text-[11px] font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-all text-slate-600"
                    >
                      {v >= 1000 ? `${v / 1000}K` : v}
                    </button>
                  ))}
                </div>
              </div>
              {creditLimitInput &&
                !isNaN(parseFloat(creditLimitInput)) &&
                parseFloat(creditLimitInput) > 0 && (
                  <p className="mt-1.5 text-xs font-medium text-slate-500">
                    = {money(Math.round(parseFloat(creditLimitInput) * 100))}
                  </p>
                )}
            </div>

            {/* Payment Terms */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                Payment Terms
              </label>
              <div className="flex gap-3">
                {([
                  { value: "net_30", label: "Net-30", sub: "30 days" },
                  { value: "net_60", label: "Net-60", sub: "60 days" },
                ] as const).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setPaymentTerms(t.value)}
                    className="flex-1 max-w-[160px] px-4 py-3 rounded-xl text-left border-2 transition-all"
                    style={{
                      background:
                        paymentTerms === t.value ? "#0f172a" : "#f8fafc",
                      borderColor:
                        paymentTerms === t.value ? "#0f172a" : "#e2e8f0",
                    }}
                  >
                    <div
                      className="text-sm font-black"
                      style={{
                        color: paymentTerms === t.value ? "#fff" : "#0f172a",
                      }}
                    >
                      {t.label}
                    </div>
                    <div
                      className="text-[10px] font-semibold"
                      style={{
                        color:
                          paymentTerms === t.value
                            ? "rgba(255,255,255,0.6)"
                            : "#94a3b8",
                      }}
                    >
                      {t.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Notes Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                  Internal Notes{" "}
                  <span className="text-slate-400 font-normal normal-case">
                    (admin only)
                  </span>
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  placeholder="Internal decision rationale..."
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 resize-y focus:outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 focus:bg-white transition-all placeholder:text-slate-400"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                  Message to Applicant{" "}
                  <span className="text-slate-400 font-normal normal-case">
                    (visible to org)
                  </span>
                </label>
                <textarea
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  rows={3}
                  placeholder="Welcome message or rejection reason..."
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 resize-y focus:outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 focus:bg-white transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 font-medium">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
              {app.status !== "approved" && (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Approve & Activate
                </button>
              )}

              {app.status !== "rejected" && (
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <X className="w-4 h-4" />
                  )}
                  {app.status === "approved" ? "Revoke Access" : "Reject"}
                </button>
              )}

              {(app.status === "approved" || app.status === "rejected") && (
                <button
                  type="button"
                  onClick={handleRevert}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-slate-600 border border-slate-300 bg-white hover:bg-slate-50 transition-all disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  Revert
                </button>
              )}

              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-slate-600 border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-all ml-auto disabled:opacity-60"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Notes
              </button>
            </div>

            {/* Active Status Banner */}
            {app.status === "approved" && app.approved_credit_limit_cents && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-3">
                <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-800">
                  <span className="font-bold">Active Account:</span>{" "}
                  {money(app.approved_credit_limit_cents)} limit ·{" "}
                  {formatTerms(app.payment_terms)} terms
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   PAGE — PROFESSIONAL DASHBOARD LAYOUT
══════════════════════════════════════════════════════════════════════════════ */

export default function AdminBusinessPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [applications, setApplications] = useState<BusinessApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("pending");
  const [search, setSearch] = useState("");
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    async function checkAdmin() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/auth/login");
          return;
        }

        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!alive) return;
        if (!prof || prof.role !== "admin") {
          router.replace("/");
          return;
        }

        setAdminId(user.id);
      } catch (err) {
        console.error("[admin/business] auth check error:", err);
        if (alive) router.replace("/");
      } finally {
        if (alive) setChecking(false);
      }
    }
    checkAdmin();
    return () => {
      alive = false;
    };
  }, [router]);

  // ── Load applications ─────────────────────────────────────────────────────
  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const { data: apps, error } = await supabase
        .from("business_applications")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (!apps?.length) {
        setApplications([]);
        setLoading(false);
        return;
      }

      const userIds = [...new Set(apps.map((a: any) => a.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, display_name, full_name")
        .in("id", userIds);

      const profileMap: Record<
        string,
        { email: string | null; name: string | null }
      > = {};
      for (const p of profiles ?? []) {
        profileMap[p.id] = {
          email: (p as any).email ?? null,
          name: (p as any).display_name ?? (p as any).full_name ?? null,
        };
      }

      const enriched: BusinessApp[] = apps.map((a: any) => ({
        ...a,
        profile_email: profileMap[a.user_id]?.email ?? null,
        profile_name: profileMap[a.user_id]?.name ?? null,
      }));

      setApplications(enriched);
    } catch (err) {
      console.error("[admin/business] load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!adminId) return;
    loadApplications();
  }, [adminId, loadApplications]);

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    if (!adminId) return;

    realtimeRef.current = supabase
      .channel("admin-business-apps")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "business_applications" },
        () => loadApplications(),
      )
      .subscribe();

    return () => {
      if (realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }
    };
  }, [adminId, loadApplications]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const pendingCount = applications.filter(
    (a) => a.status === "pending",
  ).length;
  const approvedCount = applications.filter(
    (a) => a.status === "approved",
  ).length;
  const rejectedCount = applications.filter(
    (a) => a.status === "rejected",
  ).length;

  const totalCreditApproved = applications
    .filter((a) => a.status === "approved")
    .reduce(
      (sum, a) => sum + (a.approved_credit_limit_cents || 0),
      0,
    );

  const filtered = applications.filter((a) => {
    const matchStatus =
      filterStatus === "all" || a.status === filterStatus;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      a.org_name.toLowerCase().includes(q) ||
      a.contact_name.toLowerCase().includes(q) ||
      (a.tin_number ?? "").toLowerCase().includes(q) ||
      (a.profile_email ?? "").toLowerCase().includes(q) ||
      a.office_address.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  // ── Guard renders ─────────────────────────────────────────────────────────
  if (checking) {
    return (
      <main className="py-6">
        <div className="glass glass-ring rounded-[28px] p-6 text-sm text-slate-700">
          Verifying admin access…
        </div>
      </main>
    );
  }

  if (!adminId) return null;

  return (
    <main className="py-4 md:py-6 space-y-6">
      {/* Header — Compact Professional */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <button
            onClick={() => router.push("/admin")}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Admin
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-lime-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-lime-400/20">
              <Building2 className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">
                Business Applications
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Manage B2B accounts, credit limits, and payment terms
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={loadApplications}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-all shadow-sm self-start"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RotateCcw className="w-4 h-4" />
          )}
          Refresh
        </button>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Applications"
          value={applications.length}
          color="#0f172a"
          icon={Building2}
        />
        <StatCard
          label="Pending Review"
          value={pendingCount}
          color="#f59e0b"
          icon={Clock}
          trend={pendingCount > 0 ? "Action needed" : undefined}
        />
        <StatCard
          label="Approved"
          value={approvedCount}
          color="#10b981"
          icon={Check}
        />
        <StatCard
          label="Total Credit Approved"
          value={Math.round(totalCreditApproved / 100)}
          color="#3b82f6"
          icon={Shield}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Left Sidebar — Filters & Summary */}
        <div className="xl:col-span-1 space-y-4">
          {/* Status Filter */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">
                Filter by Status
              </h3>
            </div>
            <div className="p-2 space-y-1">
              {([
                {
                  value: "pending",
                  label: "Pending",
                  count: pendingCount,
                  color: "#f59e0b",
                },
                {
                  value: "approved",
                  label: "Approved",
                  count: approvedCount,
                  color: "#10b981",
                },
                {
                  value: "rejected",
                  label: "Rejected",
                  count: rejectedCount,
                  color: "#ef4444",
                },
                {
                  value: "all",
                  label: "All Applications",
                  count: applications.length,
                  color: "#64748b",
                },
              ] as {
                value: FilterStatus;
                label: string;
                count: number;
                color: string;
              }[]).map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setFilterStatus(tab.value)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background:
                      filterStatus === tab.value
                        ? `${tab.color}10`
                        : "transparent",
                    color:
                      filterStatus === tab.value
                        ? tab.color
                        : "#64748b",
                  }}
                >
                  <span>{tab.label}</span>
                  <span
                    className="text-[10px] font-black px-2 py-0.5 rounded-full"
                    style={{
                      background:
                        filterStatus === tab.value
                          ? tab.color
                          : "#f1f5f9",
                      color:
                        filterStatus === tab.value
                          ? "#fff"
                          : "#64748b",
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Search */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">
              Search
            </h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Org, contact, TIN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 focus:bg-white transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-300 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Summary Info */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-4 text-white">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
              Overview
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-300">
                  Approval Rate
                </span>
                <span className="text-sm font-bold">
                  {applications.length > 0
                    ? Math.round(
                        (approvedCount / applications.length) * 100,
                      )
                    : 0}
                  %
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-300">
                  Avg. Credit
                </span>
                <span className="text-sm font-bold">
                  {approvedCount > 0
                    ? money(totalCreditApproved / approvedCount)
                    : "—"}
                </span>
              </div>
              <div className="h-px bg-slate-700 my-2" />
              <div className="text-[10px] text-slate-400 leading-relaxed">
                Review pending applications to activate B2B accounts
                with custom credit limits.
              </div>
            </div>
          </div>
        </div>

        {/* Right Content — Application List */}
        <div className="xl:col-span-3 space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                {filterStatus === "all"
                  ? "All Applications"
                  : filterStatus === "pending"
                  ? "Pending Review"
                  : filterStatus === "approved"
                  ? "Approved Accounts"
                  : "Rejected Applications"}
              </h2>
              <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                {filtered.length}
              </span>
            </div>

            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Clear search
              </button>
            )}
          </div>

          {/* List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-12 rounded-full bg-slate-200" />
                    <div className="w-10 h-10 rounded-xl bg-slate-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-slate-200 rounded w-1/3" />
                      <div className="h-3 bg-slate-200 rounded w-1/4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">
                {search ? "No matches found" : "No applications"}
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                {search
                  ? "Try adjusting your search terms"
                  : "New business applications will appear here"}
              </p>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((app) => (
                <ApplicationCard
                  key={app.id}
                  app={app}
                  adminId={adminId}
                  onRefresh={loadApplications}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}