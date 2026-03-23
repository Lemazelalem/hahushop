// app/invoices/page.tsx
"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Printer,
  Search,
  X,
  Download,
  Building2,
  Calendar,
  CreditCard,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════════════ */

type InvoiceStatus = "paid" | "overdue" | "unpaid";

type OrderItem = {
  id: string;
  name_snapshot: string;
  emoji_snapshot: string | null;
  image_url_snapshot: string | null;
  quantity: number;
  unit_price_cents: number;
  line_total_cents: number;
};

type Invoice = {
  id: string;
  created_at: string;
  due_date: string;
  subtotal_cents: number;
  tax_cents: number;
  shipping_cents: number | null;
  total_cents: number;
  status: string;
  payment_status: string | null;
  shipping_name: string | null;
  shipping_city: string | null;
  invoice_status: InvoiceStatus;
  items: OrderItem[];
};

type BusinessProfile = {
  business_org_name: string | null;
  business_payment_terms: "net_30" | "net_60" | null;
  business_credit_limit_cents: number | null;
  business_credit_used_cents: number | null;
};

type FilterStatus = "all" | InvoiceStatus;

/* ══════════════════════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════════════════════ */

function money(cents: number | null | undefined): string {
  const safe = typeof cents === "number" && cents > 0 ? cents : 0;
  return `ETB ${(safe / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function invoiceNumber(id: string): string {
  return `INV-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function deriveInvoiceStatus(order: {
  status: string;
  payment_status: string | null;
  due_date: string;
}): InvoiceStatus {
  if (
    order.payment_status === "paid" ||
    order.status === "paid" ||
    order.status === "completed"
  ) {
    return "paid";
  }
  if (new Date(order.due_date) < new Date()) return "overdue";
  return "unpaid";
}

function statusStyle(s: InvoiceStatus): {
  bg: string;
  text: string;
  border: string;
  label: string;
  icon: ReactNode;
} {
  if (s === "paid")
    return {
      bg: "#f0fdf4",
      text: "#15803d",
      border: "#bbf7d0",
      label: "Paid",
      icon: <CheckCircle className="w-3 h-3" />,
    };
  if (s === "overdue")
    return {
      bg: "#fef2f2",
      text: "#dc2626",
      border: "#fecaca",
      label: "Overdue",
      icon: <AlertCircle className="w-3 h-3" />,
    };
  return {
    bg: "#fffbeb",
    text: "#b45309",
    border: "#fde68a",
    label: "Unpaid",
    icon: <Clock className="w-3 h-3" />,
  };
}

function vatFromTotal(totalCents: number): number {
  return Math.round((totalCents * 15) / 115);
}

function preVatFromTotal(totalCents: number): number {
  return totalCents - vatFromTotal(totalCents);
}

function daysUntilDue(due: string): number {
  return Math.ceil(
    (new Date(due).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   PRINT / PDF
══════════════════════════════════════════════════════════════════════════════ */

function printInvoice(invoice: Invoice, profile: BusinessProfile) {
  const items = invoice.items
    .map(
      (item) => `
      <tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:12px 8px;font-size:13px;color:#111827">${item.emoji_snapshot ?? ""} ${item.name_snapshot}</td>
        <td style="padding:12px 8px;font-size:13px;text-align:center;color:#374151">${item.quantity}</td>
        <td style="padding:12px 8px;font-size:13px;text-align:right;color:#374151">${money(item.unit_price_cents)}</td>
        <td style="padding:12px 8px;font-size:13px;text-align:right;color:#111827;font-weight:600">${money(item.line_total_cents)}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>${invoiceNumber(invoice.id)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 40px; color: #111827; background: #fff; line-height: 1.5; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #e5e7eb; }
    .logo { font-size: 20px; font-weight: 700; color: #111827; }
    .inv-num { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
    .inv-big { font-size: 24px; font-weight: 700; color: #111827; letter-spacing: -0.01em; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 32px; }
    .label { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .value { font-size: 13px; color: #111827; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { font-size: 11px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 8px; border-bottom: 2px solid #e5e7eb; text-align: left; background: #f9fafb; }
    th:not(:first-child) { text-align: right; }
    th:nth-child(2) { text-align: center; }
    .totals { margin-left: auto; width: 320px; margin-top: 24px; padding-top: 16px; border-top: 2px solid #e5e7eb; }
    .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #374151; }
    .total-row.final { margin-top: 8px; padding-top: 12px; border-top: 2px solid #111827; font-size: 15px; font-weight: 700; color: #111827; }
    .status-pill { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; margin-top: 8px; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280; text-align: center; line-height: 1.6; }
    @media print { body { padding: 24px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">HahuShop Business</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">HahuShop Ethiopia · business@shopease.et</div>
    </div>
    <div style="text-align:right">
      <div class="inv-num">Invoice</div>
      <div class="inv-big">${invoiceNumber(invoice.id)}</div>
      <span class="status-pill" style="background:${statusStyle(invoice.invoice_status).bg};color:${statusStyle(invoice.invoice_status).text};border:1px solid ${statusStyle(invoice.invoice_status).border}">
        ${statusStyle(invoice.invoice_status).label}
      </span>
    </div>
  </div>

  <div class="grid">
    <div>
      <div class="label">Bill To</div>
      <div class="value">
        ${profile.business_org_name ?? "Your Organization"}<br/>
        ${invoice.shipping_city ?? "Addis Ababa"}, Ethiopia
      </div>
    </div>
    <div>
      <div class="label">Invoice Details</div>
      <div class="value">
        <strong>Issued:</strong> ${formatDate(invoice.created_at)}<br/>
        <strong>Due:</strong> ${formatDate(invoice.due_date)}<br/>
        <strong>Terms:</strong> ${profile.business_payment_terms === "net_60" ? "Net-60" : "Net-30"}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Unit Price</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${items}</tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span>Subtotal (Pre-VAT)</span><span>${money(preVatFromTotal(invoice.total_cents))}</span></div>
    ${
      invoice.shipping_cents
        ? `<div class="total-row"><span>Shipping</span><span>${money(invoice.shipping_cents)}</span></div>`
        : ""
    }
    <div class="total-row"><span>VAT (15% Inclusive)</span><span>${money(vatFromTotal(invoice.total_cents))}</span></div>
    <div class="total-row final"><span>Total Due</span><span>${money(invoice.total_cents)}</span></div>
  </div>

  <div class="footer">
    Please settle this invoice by ${formatDate(invoice.due_date)} via bank transfer. Reference: ${invoiceNumber(invoice.id)}<br/>
    Payments reconciled within 1–2 business days · HahuShop Business · business@shopease.et
  </div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

/* ══════════════════════════════════════════════════════════════════════════════
   INVOICE CARD (SIMPLE PROFESSIONAL)
══════════════════════════════════════════════════════════════════════════════ */

function InvoiceCard({
  invoice,
  profile,
}: {
  invoice: Invoice;
  profile: BusinessProfile;
}) {
  const [open, setOpen] = useState(false);
  const st = statusStyle(invoice.invoice_status);
  const days = daysUntilDue(invoice.due_date);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header Row */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors border-b border-gray-100"
      >
        <div
          className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
          style={{ background: st.bg, border: `1px solid ${st.border}` }}
        >
          <FileText className="w-4 h-4" style={{ color: st.text }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-900 font-mono">
              {invoiceNumber(invoice.id)}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide border"
              style={{
                background: st.bg,
                color: st.text,
                borderColor: st.border,
              }}
            >
              {st.icon}
              {st.label}
            </span>
            {invoice.invoice_status === "overdue" && (
              <span className="text-[11px] font-medium text-red-600">
                {Math.abs(days)}d overdue
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <span>Issued {formatDate(invoice.created_at)}</span>
            <span>·</span>
            <span>Due {formatDate(invoice.due_date)}</span>
            <span>·</span>
            <span>{invoice.items.length} items</span>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <div className="text-sm font-semibold text-gray-900">
              {money(invoice.total_cents)}
            </div>
            <div className="text-[11px] text-gray-400 uppercase">
              {profile.business_payment_terms === "net_60" ? "Net-60" : "Net-30"}
            </div>
          </div>
          {open ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Panel */}
      {open && (
        <div className="bg-gray-50">
          {/* Line Items Table */}
          <div className="px-4 py-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Item</th>
                  <th className="text-center py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wide w-20">Qty</th>
                  <th className="text-right py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wide w-28">Unit Price</th>
                  <th className="text-right py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wide w-28">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoice.items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-sm text-gray-400">
                      No items found
                    </td>
                  </tr>
                ) : (
                  invoice.items.map((item) => (
                    <tr key={item.id} className="hover:bg-white">
                      <td className="py-2.5 flex items-center gap-2">
                        {item.image_url_snapshot ? (
                          <img
                            src={item.image_url_snapshot}
                            alt={item.name_snapshot}
                            className="w-8 h-8 rounded object-cover border border-gray-200"
                          />
                        ) : (
                          <span className="text-base">{item.emoji_snapshot ?? "📦"}</span>
                        )}
                        <span className="text-sm text-gray-900">{item.name_snapshot}</span>
                      </td>
                      <td className="py-2.5 text-center text-sm text-gray-600">{item.quantity}</td>
                      <td className="py-2.5 text-right text-sm text-gray-600">{money(item.unit_price_cents)}</td>
                      <td className="py-2.5 text-right text-sm font-semibold text-gray-900">{money(item.line_total_cents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Totals Section */}
          <div className="px-4 py-3 bg-white border-t border-gray-200">
            <div className="flex flex-col sm:flex-row sm:justify-end gap-4">
              <div className="w-full sm:w-64 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal (Pre-VAT)</span>
                  <span className="font-medium text-gray-900">{money(preVatFromTotal(invoice.total_cents))}</span>
                </div>
                {(invoice.shipping_cents ?? 0) > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Shipping</span>
                    <span className="font-medium text-gray-900">{money(invoice.shipping_cents)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600">
                  <span>VAT (15% incl.)</span>
                  <span className="font-medium text-gray-900">{money(vatFromTotal(invoice.total_cents))}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <span className="font-semibold text-gray-900">Total Due</span>
                  <span className="font-bold text-gray-900">{money(invoice.total_cents)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Building2 className="w-3.5 h-3.5" />
              <span>Ref: <span className="font-mono font-semibold text-gray-900">{invoiceNumber(invoice.id)}</span></span>
            </div>
            <div className="flex items-center gap-2">
              {invoice.invoice_status !== "paid" && (
                <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                  Pay by {formatDate(invoice.due_date)}
                </span>
              )}
              <button
                onClick={() => printInvoice(invoice, profile)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   SIMPLE STAT CARD
══════════════════════════════════════════════════════════════════════════════ */

function StatCard({
  label,
  value,
  subtext,
  accent = false,
}: {
  label: string;
  value: string;
  subtext: string;
  accent?: boolean;
}) {
  return (
    <div className={`bg-white border rounded-lg p-4 ${accent ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-base font-bold ${accent ? 'text-green-700' : 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════════ */

export default function InvoicesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/auth/login?redirect=/invoices");
          return;
        }

        const { data: prof } = await supabase
          .from("profiles")
          .select(
            "is_business_account, business_org_name, business_payment_terms, business_credit_limit_cents, business_credit_used_cents"
          )
          .eq("id", user.id)
          .maybeSingle();

        if (!alive) return;

        if (!prof?.is_business_account) {
          setAccessDenied(true);
          setLoading(false);
          return;
        }

        setProfile({
          business_org_name: prof.business_org_name ?? null,
          business_payment_terms: prof.business_payment_terms ?? "net_30",
          business_credit_limit_cents: prof.business_credit_limit_cents ?? null,
          business_credit_used_cents: prof.business_credit_used_cents ?? null,
        });

        const termDays = prof.business_payment_terms === "net_60" ? 60 : 30;

        const { data: orders, error: ordersError } = await supabase
          .from("orders")
          .select(
            "id, created_at, subtotal_cents, tax_cents, shipping_cents, total_cents, status, payment_status, shipping_name, shipping_city, cart_snapshot"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (!alive) return;
        if (ordersError) throw ordersError;

        if (!orders?.length) {
          setInvoices([]);
          setLoading(false);
          return;
        }

        const itemsByOrder: Record<string, OrderItem[]> = {};
        for (const o of orders as any[]) {
          const snapshotItems = o.cart_snapshot?.items ?? [];
          itemsByOrder[o.id] = snapshotItems.map((item: any, idx: number) => ({
            id: `${o.id}-${idx}`,
            name_snapshot: item.name ?? "Product",
            emoji_snapshot: item.emoji ?? null,
            image_url_snapshot: item.image_url ?? null,
            quantity: item.qty ?? 1,
            unit_price_cents: item.unit_price_cents ?? 0,
            line_total_cents: item.line_total_cents ?? 0,
          }));
        }

        const built: Invoice[] = orders.map((o: any) => {
          const due_date = addDays(o.created_at, termDays);
          const invoice_status = deriveInvoiceStatus({
            status: o.status,
            payment_status: o.payment_status,
            due_date,
          });
          return {
            id: o.id,
            created_at: o.created_at,
            due_date,
            subtotal_cents: o.subtotal_cents ?? 0,
            tax_cents: o.tax_cents ?? 0,
            shipping_cents: o.shipping_cents ?? null,
            total_cents: o.total_cents ?? 0,
            status: o.status,
            payment_status: o.payment_status ?? null,
            shipping_name: o.shipping_name ?? null,
            shipping_city: o.shipping_city ?? null,
            invoice_status,
            items: itemsByOrder[o.id] ?? [],
          };
        });

        if (alive) {
          setInvoices(built);
          setLoading(false);
        }
      } catch (err) {
        console.error("[invoices] load error:", err);
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [router]);

  const filtered = invoices.filter((inv) => {
    const matchFilter = filter === "all" || inv.invoice_status === filter;
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      invoiceNumber(inv.id).toLowerCase().includes(q) ||
      formatDate(inv.created_at).toLowerCase().includes(q) ||
      inv.items.some((item) => item.name_snapshot.toLowerCase().includes(q));
    return matchFilter && matchSearch;
  });

  const counts = {
    all: invoices.length,
    unpaid: invoices.filter((i) => i.invoice_status === "unpaid").length,
    overdue: invoices.filter((i) => i.invoice_status === "overdue").length,
    paid: invoices.filter((i) => i.invoice_status === "paid").length,
  };

  const totalOutstanding = invoices
    .filter((i) => i.invoice_status !== "paid")
    .reduce((sum, i) => sum + i.total_cents, 0);

  /* ── Access denied ── */
  if (!loading && accessDenied) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-lg border border-gray-200 p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center mx-auto mb-4 text-2xl">
            🔒
          </div>
          <h1 className="text-base font-bold text-gray-900 mb-2">Business Account Required</h1>
          <p className="text-sm text-gray-500 mb-6">
            This page is only available to approved business accounts.
          </p>
          <Link
            href="/business"
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors"
          >
            Apply for Business Account
          </Link>
        </div>
      </div>
    );
  }

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center mx-auto mb-3">
            <FileText className="w-5 h-5 text-gray-600" />
          </div>
          <div className="text-sm text-gray-500">Loading invoices…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/business")}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="h-4 w-px bg-gray-200" />
            <h1 className="text-sm font-semibold text-gray-900">Invoices</h1>
          </div>
          
          <Link
            href="/shop"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors"
          >
            New Order
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Page Title */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">
              {profile?.business_org_name ?? "Your Organization"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {profile?.business_payment_terms === "net_60" ? "Net-60" : "Net-30"} payment terms
            </p>
          </div>
          {counts.overdue > 0 && (
            <span className="px-2.5 py-1 rounded text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
              {counts.overdue} overdue
            </span>
          )}
        </div>

        {/* Simple Stats */}
        {invoices.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard 
              label="Outstanding"
              value={money(totalOutstanding)}
              subtext={`${counts.unpaid + counts.overdue} invoices`}
            />
            <StatCard 
              label="Overdue"
              value={money(invoices.filter((i) => i.invoice_status === "overdue").reduce((s, i) => s + i.total_cents, 0))}
              subtext={`${counts.overdue} invoices`}
              accent={counts.overdue > 0}
            />
            <StatCard 
              label="Paid"
              value={money(invoices.filter((i) => i.invoice_status === "paid").reduce((s, i) => s + i.total_cents, 0))}
              subtext={`${counts.paid} invoices`}
            />
            <StatCard 
              label="Total"
              value={money(invoices.reduce((s, i) => s + i.total_cents, 0))}
              subtext={`${counts.all} invoices`}
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {([
              { value: "all", label: "All" },
              { value: "unpaid", label: "Unpaid" },
              { value: "overdue", label: "Overdue" },
              { value: "paid", label: "Paid" },
            ] as { value: FilterStatus; label: string }[]).map((tab) => (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                  filter === tab.value
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-[10px] opacity-70">({counts[tab.value]})</span>
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-gray-400 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Invoice List */}
        {invoices.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <div className="text-3xl mb-3">🧾</div>
            <p className="text-sm font-semibold text-gray-900 mb-1">No invoices yet</p>
            <p className="text-xs text-gray-500 mb-4">Invoices are generated when you place orders.</p>
            <Link
              href="/shop"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-gray-900 text-white hover:bg-gray-800 transition-colors"
            >
              Start Shopping
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-sm font-semibold text-gray-900 mb-1">No invoices found</p>
            <p className="text-xs text-gray-500 mb-3">Try adjusting your filters.</p>
            <button
              onClick={() => {
                setFilter("all");
                setSearch("");
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((inv) => (
              <InvoiceCard key={inv.id} invoice={inv} profile={profile!} />
            ))}
            <p className="text-center text-xs text-gray-400 py-2">
              Showing {filtered.length} of {invoices.length} invoices
            </p>
          </div>
        )}

        {/* Payment Info */}
        {invoices.some((i) => i.invoice_status !== "paid") && (
          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50">
            <div className="flex items-start gap-3">
              <Building2 className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-900 mb-1">Bank Transfer Payment</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Include the invoice reference (e.g., <span className="font-mono font-semibold text-gray-700">INV-XXXXXXXX</span>) in your transfer description. 
                  Payments reconciled within 1–2 business days.
                </p>
              </div>
              <a
                href="mailto:business@shopease.et"
                className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                Contact →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}