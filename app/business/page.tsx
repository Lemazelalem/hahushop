"use client";

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { supabase } from "@/lib/supabaseClient";

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Globe,
  GraduationCap,
  HeartPulse,
  Landmark,
  MapPin,
  Package,
  Pencil,
  Phone,
  ShoppingBag,
  Truck,
  Upload,
  Users,
  X,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════════════════════ */

type AppStatus = "pending" | "approved" | "rejected";

type BusinessApplication = {
  id: string;
  org_name: string;
  org_type: string;
  tin_number: string | null;
  contact_name: string;
  contact_phone: string | null;
  office_address: string;
  estimated_monthly_spend_cents: number | null;
  preferred_payment_terms: "net_30" | "net_60";
  document_url: string | null;
  storage_path: string | null;
  status: AppStatus;
  approved_credit_limit_cents: number | null;
  payment_terms: "net_30" | "net_60" | null;
  reviewer_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
};

type BusinessProfile = {
  is_business_account: boolean;
  business_credit_limit_cents: number | null;
  business_credit_used_cents: number | null;
  business_payment_terms: "net_30" | "net_60" | null;
  business_org_name: string | null;
};

type PageView =
  | "loading"
  | "landing"
  | "apply"
  | "pending"
  | "rejected"
  | "approved";

type BusinessLandingFactKey =
  | "activeOrganizations"
  | "creditIssued"
  | "officeDelivery"
  | "avgApprovalTime";

type BusinessLandingFactItem = {
  orgName: string;
  orgType: string | null;
  status: "pending" | "approved";
  paymentTerms: "net_30" | "net_60" | null;
  approvedCreditLimitCents: number | null;
  approvalHours: number | null;
  createdAt: string | null;
  reviewedAt: string | null;
};

type BusinessLandingFacts = {
  activeOrganizationsCount: number;
  approvedCreditCents: number;
  officeDeliveryCount: number;
  avgApprovalHours: number | null;
  activeOrganizations: BusinessLandingFactItem[];
  creditOrganizations: BusinessLandingFactItem[];
  deliveryOrganizations: BusinessLandingFactItem[];
  approvalOrganizations: BusinessLandingFactItem[];
};

/* ══════════════════════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════════════════════ */

const ORG_TYPES = [
  { icon: Building2, label: "Private Company" },
  { icon: Landmark, label: "Government Office" },
  { icon: Globe, label: "Embassy / Consulate" },
  { icon: Users, label: "NGO / Non-Profit" },
  { icon: GraduationCap, label: "University / School" },
  { icon: HeartPulse, label: "Hospital / Clinic" },
];

const BENEFITS = [
  {
    icon: CreditCard,
    title: "Net-30 / Net-60 Credit",
    desc: "Shop now, pay later on monthly invoices. Credit limits set per organization by our team.",
  },
  {
    icon: Truck,
    title: "Office Delivery in 1–3 Days",
    desc: "All bulk orders delivered directly to your registered office address. No pickups, no logistics headache.",
    highlight: true,
  },
  {
    icon: Package,
    title: "Bulk Order Pricing",
    desc: "Volume discounts automatically applied when ordering 10+ units of any approved product.",
  },
  {
    icon: FileText,
    title: "Automated Invoicing",
    desc: "Tax-ready invoices generated on every order. Export to PDF or send directly to your finance team.",
  },
  {
    icon: Users,
    title: "Dedicated Account Manager",
    desc: "A HahuShop rep assigned to your organization for procurement support and product sourcing.",
  },
  {
    icon: BarChart3,
    title: "Spend Analytics",
    desc: "Monthly reports on category breakdowns, top vendors, and budget utilization.",
  },
];

const HOW_IT_WORKS = [
  {
    n: "01",
    title: "Apply",
    desc: "Submit your organization details, TIN number, and registration document.",
  },
  {
    n: "02",
    title: "Review",
    desc: "Our team reviews your application within 2 business days.",
  },
  {
    n: "03",
    title: "Approved",
    desc: "Receive your credit limit and payment terms. Start placing bulk orders immediately.",
  },
  {
    n: "04",
    title: "Office Delivery",
    desc: "Bulk orders delivered directly to your registered office in 1–3 business days.",
    accent: true,
  },
  {
    n: "05",
    title: "Invoice & Pay",
    desc: "Receive a tax-ready invoice. Pay via bank transfer on your Net-30 or Net-60 terms.",
  },
];

const FACT_ACCENTS: Record<BusinessLandingFactKey, string> = {
  activeOrganizations: "#818cf8",
  creditIssued: "#34d399",
  officeDelivery: "#38bdf8",
  avgApprovalTime: "#a78bfa",
};

const EMPTY_LANDING_FACTS: BusinessLandingFacts = {
  activeOrganizationsCount: 0,
  approvedCreditCents: 0,
  officeDeliveryCount: 0,
  avgApprovalHours: null,
  activeOrganizations: [],
  creditOrganizations: [],
  deliveryOrganizations: [],
  approvalOrganizations: [],
};

const HERO_STYLES = `
  .hero-sans {
    font-family: "Inter", "Google Sans", "Product Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  @keyframes hero-fade-up {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .hero-fade-up  { animation: hero-fade-up 0.55s cubic-bezier(0.22,1,0.36,1) both; }
  .hero-delay-1  { animation-delay: 0.08s; }
  .hero-delay-2  { animation-delay: 0.16s; }
  .hero-delay-3  { animation-delay: 0.24s; }
  .hero-delay-4  { animation-delay: 0.32s; }

  @keyframes hero-shimmer {
    0%   { background-position: 0% center; }
    100% { background-position: 200% center; }
  }

  .hero-shimmer {
    background: linear-gradient(90deg, #7dd3fc 0%, #34d399 50%, #7dd3fc 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: hero-shimmer 6s linear infinite;
    display: inline-block;
    padding-bottom: 4px;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
    gap: clamp(18px, 3vw, 40px);
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
    padding: clamp(38px, 6vw, 64px) clamp(20px, 4vw, 28px);
  }

  @media (max-width: 900px) {
    .hero-grid {
      grid-template-columns: 1fr;
      gap: 26px;
      padding: 30px 18px 40px;
    }
  }

  .hero-copy {
    min-width: 0;
    max-width: 620px;
  }

  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 999px;
    padding: 7px 14px;
    margin-bottom: 18px;
    background: rgba(99, 102, 241, 0.10);
    border: 1px solid rgba(129, 140, 248, 0.26);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
  }

  .hero-title {
    font-size: clamp(1.6rem, 3.5vw, 3rem);
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.04em;
    color: #f8fafc;
    margin: 0 0 18px 0;
  }

  .hero-title-tight {
    display: block;
    white-space: nowrap;
    overflow: visible;
    padding-bottom: 4px;
  }

  .hero-body {
    font-size: clamp(0.96rem, 1.2vw, 1.02rem);
    line-height: 1.72;
    color: rgba(226,232,240,0.72);
    max-width: 560px;
    margin: 0 0 26px 0;
  }

  .hero-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .hero-btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 46px;
    padding: 0 22px;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    text-decoration: none;
    background: #ffffff;
    color: #0f172a;
    font-size: 14px;
    font-weight: 600;
    transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
    white-space: nowrap;
  }

  .hero-btn-primary:hover {
    background: #f8fafc;
    transform: translateY(-1px);
    box-shadow: 0 10px 28px rgba(255,255,255,0.12);
  }

  .hero-btn-ghost {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 46px;
    padding: 0 22px;
    border-radius: 12px;
    cursor: pointer;
    text-decoration: none;
    background: rgba(255,255,255,0.02);
    color: #cbd5e1;
    border: 1px solid rgba(148,163,184,0.26);
    font-size: 14px;
    font-weight: 600;
    transition: border-color 0.18s ease, color 0.18s ease, background 0.18s ease;
    white-space: nowrap;
  }

  .hero-btn-ghost:hover {
    color: #ffffff;
    border-color: rgba(148,163,184,0.45);
    background: rgba(255,255,255,0.04);
  }

  .hero-stats-wrap {
    width: 100%;
  }

  .hero-stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  @media (max-width: 520px) {
    .hero-stats-grid {
      grid-template-columns: 1fr;
    }
  }

  .hero-stat-card {
    width: 100%;
    text-align: left;
    cursor: pointer;
    appearance: none;
    background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.04));
    border: 1px solid rgba(255,255,255,0.10);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 18px;
    padding: 16px 18px 14px;
    min-height: 138px;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.04),
      0 12px 30px rgba(2,6,23,0.16);
    transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
  }

  .hero-stat-card.is-active {
    transform: translateY(-2px);
    border-color: rgba(125,211,252,0.30);
    background: linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06));
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,0.08),
      0 18px 40px rgba(2,6,23,0.24);
  }

  .hero-stat-card:focus-visible {
    outline: 2px solid rgba(125,211,252,0.65);
    outline-offset: 2px;
  }

  .hero-stat-card:hover {
    transform: translateY(-2px);
    border-color: rgba(129,140,248,0.22);
    background: linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.05));
  }

  .hero-stat-value {
    font-size: clamp(1.25rem, 1.8vw, 1.9rem);
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.04em;
    color: #f8fafc;
    margin-bottom: 10px;
  }

  .hero-stat-label {
    font-size: 0.88rem;
    font-weight: 500;
    line-height: 1.45;
    color: rgba(226,232,240,0.58);
    margin-bottom: 16px;
  }

  .hero-stat-line {
    height: 2px;
    border-radius: 999px;
    opacity: 0.82;
  }
`;

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

function formatTerms(t: "net_30" | "net_60" | null | undefined): string {
  if (t === "net_30") return "Net-30";
  if (t === "net_60") return "Net-60";
  return "?";
}

function moneyCompact(cents: number | null | undefined): string {
  const safe = typeof cents === "number" && cents > 0 ? cents : 0;
  const etb = safe / 100;

  if (etb >= 1000000000) return `ETB ${(etb / 1000000000).toFixed(1)}B`;
  if (etb >= 1000000) return `ETB ${(etb / 1000000).toFixed(1)}M`;
  if (etb >= 1000) return `ETB ${(etb / 1000).toFixed(0)}K`;

  return `ETB ${etb.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatApprovalTime(hours: number | null | undefined): string {
  if (typeof hours !== "number" || Number.isNaN(hours) || hours <= 0) return "N/A";
  if (hours >= 72) return `${(hours / 24).toFixed(hours % 24 === 0 ? 0 : 1)}d`;
  return `${Math.round(hours)}h`;
}

function formatOfficeReach(count: number): string {
  const safe = Math.max(0, Math.round(count));
  if (safe === 1) return "1 Office";
  return `${safe.toLocaleString("en-US")} Offices`;
}

function shortDate(value: string | null | undefined): string {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeLandingFactItem(value: unknown): BusinessLandingFactItem | null {
  if (!value || typeof value !== "object") return null;

  const row = value as Record<string, unknown>;
  const orgName = typeof row.orgName === "string" ? row.orgName.trim() : "";
  if (!orgName) return null;

  const status = row.status === "approved" ? "approved" : "pending";
  const paymentTerms = row.paymentTerms === "net_30" || row.paymentTerms === "net_60"
    ? row.paymentTerms
    : null;

  return {
    orgName,
    orgType: typeof row.orgType === "string" && row.orgType.trim() ? row.orgType.trim() : null,
    status,
    paymentTerms,
    approvedCreditLimitCents: coerceNumber(row.approvedCreditLimitCents),
    approvalHours: coerceNumber(row.approvalHours),
    createdAt: typeof row.createdAt === "string" ? row.createdAt : null,
    reviewedAt: typeof row.reviewedAt === "string" ? row.reviewedAt : null,
  };
}

function normalizeLandingFacts(value: unknown): BusinessLandingFacts {
  if (!value || typeof value !== "object") return EMPTY_LANDING_FACTS;

  const row = value as Record<string, unknown>;
  const list = (input: unknown) =>
    Array.isArray(input)
      ? input
          .map(normalizeLandingFactItem)
          .filter((item): item is BusinessLandingFactItem => item !== null)
      : [];

  return {
    activeOrganizationsCount: coerceNumber(row.activeOrganizationsCount) ?? 0,
    approvedCreditCents: coerceNumber(row.approvedCreditCents) ?? 0,
    officeDeliveryCount: coerceNumber(row.officeDeliveryCount) ?? 0,
    avgApprovalHours: coerceNumber(row.avgApprovalHours),
    activeOrganizations: list(row.activeOrganizations),
    creditOrganizations: list(row.creditOrganizations),
    deliveryOrganizations: list(row.deliveryOrganizations),
    approvalOrganizations: list(row.approvalOrganizations),
  };
}

function factHighlights(
  factKey: BusinessLandingFactKey,
  item: BusinessLandingFactItem
): string[] {
  if (factKey === "creditIssued") {
    return [
      item.approvedCreditLimitCents ? moneyCompact(item.approvedCreditLimitCents) : "Credit under review",
      item.paymentTerms ? formatTerms(item.paymentTerms) : "Terms pending",
    ];
  }

  if (factKey === "officeDelivery") {
    return [
      item.status === "approved" ? "Delivery-ready account" : "Address received",
      item.paymentTerms ? formatTerms(item.paymentTerms) : "Terms pending",
    ];
  }

  if (factKey === "avgApprovalTime") {
    return [
      item.approvalHours ? `Approved in ${formatApprovalTime(item.approvalHours)}` : "Approval timing pending",
      item.reviewedAt ? `Reviewed ${shortDate(item.reviewedAt)}` : `Applied ${shortDate(item.createdAt)}`,
    ];
  }

  return [
    item.status === "approved" ? "Approved organization" : "Onboarding organization",
    item.paymentTerms ? formatTerms(item.paymentTerms) : "Terms pending",
  ];
}

/* ══════════════════════════════════════════════════════════════════════════════
   LANDING PAGE
══════════════════════════════════════════════════════════════════════════════ */

function LandingPage({
  onApply,
  isLoggedIn,
  landingFacts,
  landingFactsLoading,
}: {
  onApply: () => void;
  isLoggedIn: boolean;
  landingFacts: BusinessLandingFacts | null;
  landingFactsLoading: boolean;
}) {
  const [activeFact, setActiveFact] = useState<BusinessLandingFactKey>("activeOrganizations");
  const facts = landingFacts ?? EMPTY_LANDING_FACTS;

  const factCards = [
    {
      key: "activeOrganizations" as const,
      value: landingFactsLoading ? "..." : facts.activeOrganizationsCount.toLocaleString("en-US"),
      label: "Active Organizations",
      accent: FACT_ACCENTS.activeOrganizations,
      helper: "Approved and onboarding accounts",
      items: facts.activeOrganizations,
      panelTitle: "Organizations currently using Hahu Business",
      panelBody: "Real organization names behind the headline count, including approved accounts and organizations actively onboarding.",
    },
    {
      key: "creditIssued" as const,
      value: landingFactsLoading ? "..." : moneyCompact(facts.approvedCreditCents),
      label: "Credit Issued",
      accent: FACT_ACCENTS.creditIssued,
      helper: "Approved buying power across live accounts",
      items: facts.creditOrganizations,
      panelTitle: "Approved credit lines by organization",
      panelBody: "This total is calculated from approved business credit limits, so visitors can see the actual buying power already activated.",
    },
    {
      key: "officeDelivery" as const,
      value: landingFactsLoading ? "..." : formatOfficeReach(facts.officeDeliveryCount),
      label: "Office Delivery",
      accent: FACT_ACCENTS.officeDelivery,
      helper: "Organizations with delivery-ready office accounts",
      items: facts.deliveryOrganizations,
      panelTitle: "Organizations ready for office delivery",
      panelBody: "These organizations already have office delivery details on file, which makes the 1-3 day promise feel concrete and operational.",
    },
    {
      key: "avgApprovalTime" as const,
      value: landingFactsLoading ? "..." : formatApprovalTime(facts.avgApprovalHours),
      label: "Avg. Approval Time",
      accent: FACT_ACCENTS.avgApprovalTime,
      helper: "Average turnaround from submission to approval",
      items: facts.approvalOrganizations,
      panelTitle: "Recent approvals and review turnaround",
      panelBody: "A live look at recently approved organizations, ordered by how quickly their application moved through review.",
    },
  ];

  const selectedFact = factCards.find((card) => card.key === activeFact) ?? factCards[0];

  return (
    <div className="bg-white">
      <style>{HERO_STYLES}</style>

      <section
        className="relative overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at top right, rgba(129,140,248,0.20), transparent 28%), radial-gradient(circle at bottom right, rgba(16,185,129,0.12), transparent 26%), linear-gradient(135deg, #081225 0%, #161b56 52%, #07242a 100%)",
        }}
      >
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "30px 30px",
              opacity: 0.32,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "-18%",
              right: "6%",
              width: 480,
              height: 480,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(129,140,248,0.20) 0%, transparent 68%)",
              filter: "blur(42px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: "-16%",
              left: "2%",
              width: 340,
              height: 340,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(52,211,153,0.10) 0%, transparent 68%)",
              filter: "blur(42px)",
            }}
          />
        </div>

        <div className="hero-grid relative">
          <div className="hero-copy">
            <div className="hero-badge hero-fade-up hero-sans">
              <Briefcase style={{ width: 14, height: 14, color: "#93c5fd" }} />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.11em",
                  textTransform: "uppercase",
                  color: "#c7d2fe",
                }}
              >
                Hahu Business
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "#10b981",
                  color: "#ffffff",
                  lineHeight: 1,
                }}
              >
                NEW
              </span>
            </div>

            <h1 className="hero-title hero-fade-up hero-delay-1 hero-sans">
              <span className="hero-title-tight">Procurement for</span>
              <span className="hero-title-tight hero-shimmer">Modern Organizations</span>
            </h1>

            <p className="hero-body hero-fade-up hero-delay-2 hero-sans">
              A verified credit line to purchase on Net-30 or Net-60 terms — with bulk
              pricing, automated invoicing, and office delivery in 1–3 business days.
            </p>

            <div className="hero-actions hero-fade-up hero-delay-3">
              <button onClick={onApply} className="hero-btn-primary hero-sans">
                {isLoggedIn ? "Apply for Business Account" : "Get Started — It&apos;s Free"}
                <ArrowRight style={{ width: 15, height: 15 }} />
              </button>
              <Link href="/shop" className="hero-btn-ghost hero-sans">
                Browse Products
              </Link>
            </div>
          </div>

          <div className="hero-stats-wrap hero-fade-up hero-delay-4">
            <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300/70">
              Click a fact to inspect the organizations behind it
            </div>
            <div className="hero-stats-grid">
              {factCards.map((card) => {
                const isActive = card.key === activeFact;

                return (
                  <button
                    type="button"
                    key={card.key}
                    onClick={() => setActiveFact(card.key)}
                    aria-pressed={isActive}
                    className={`hero-stat-card hero-sans ${isActive ? "is-active" : ""}`}
                  >
                    <div className="hero-stat-value">{card.value}</div>
                    <div className="hero-stat-label">{card.label}</div>
                    <div className="mb-4 text-[11px] font-medium text-slate-300/55">
                      {card.helper}
                    </div>
                    <div
                      className="hero-stat-line"
                      style={{ background: `linear-gradient(90deg, ${card.accent}, transparent)` }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl px-5 pb-8 sm:px-6 lg:px-8">
          <div className="rounded-[28px] border border-white/10 bg-slate-950/20 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.26)] backdrop-blur-xl md:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300/80">
                  <span className="h-2 w-2 rounded-full" style={{ background: selectedFact.accent }} />
                  Live Organization Roster
                </div>
                <h3 className="mt-3 text-lg font-semibold text-white md:text-xl">{selectedFact.panelTitle}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-300/70">{selectedFact.panelBody}</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Organizations shown</div>
                <div className="mt-1 text-2xl font-semibold text-white">{selectedFact.items.length}</div>
              </div>
            </div>

            {landingFactsLoading ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-[108px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]"
                  />
                ))}
              </div>
            ) : selectedFact.items.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-white/12 bg-white/[0.03] px-4 py-6 text-sm text-slate-300/70">
                Live organization details will appear here as soon as approved Hahu Business applications are available.
              </div>
            ) : (
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {selectedFact.items.map((item) => {
                  const badges = factHighlights(selectedFact.key, item);
                  const statusClasses =
                    item.status === "approved"
                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                      : "border-amber-400/20 bg-amber-400/10 text-amber-200";

                  return (
                    <div
                      key={`${selectedFact.key}-${item.orgName}`}
                      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{item.orgName}</div>
                          <div className="mt-1 text-xs text-slate-300/65">
                            {item.orgType || "Organization"}
                          </div>
                        </div>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses}`}>
                          {item.status === "approved" ? "Approved" : "Onboarding"}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {badges.map((badge, idx) => (
                          <span
                            key={`${item.orgName}-${selectedFact.key}-${idx}`}
                            className="rounded-full border border-white/10 bg-slate-950/25 px-2.5 py-1 text-[11px] font-medium text-slate-200/85"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.08) 70%, transparent)",
          }}
        />
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500 mb-3">
              How It Works
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              From application to first order in 48 hours
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {HOW_IT_WORKS.map((step, idx) => (
              <div key={step.n} className="relative">
                {idx < 4 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-px bg-slate-200 -translate-x-4" />
                )}
                <div className={`rounded-xl p-6 h-full ${step.accent ? "bg-slate-900 text-white" : "bg-white border border-slate-200"}`}>
                  <div className={`text-4xl font-bold mb-4 ${step.accent ? "text-indigo-400" : "text-slate-200"}`}>
                    {step.n}
                  </div>
                  <h3 className={`text-base font-semibold mb-2 ${step.accent ? "text-white" : "text-slate-900"}`}>
                    {step.title}
                  </h3>
                  <p className={`text-sm leading-relaxed ${step.accent ? "text-slate-400" : "text-slate-600"}`}>
                    {step.desc}
                  </p>
                  {step.accent && (
                    <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <Clock className="w-3 h-3" />
                      1–3 BUSINESS DAYS
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500 mb-3">
              What You Get
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900">
              Built for procurement teams
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className={`rounded-xl p-6 transition-all hover:shadow-lg ${
                  b.highlight
                    ? "bg-slate-900 text-white border border-slate-700"
                    : "bg-slate-50 border border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${
                  b.highlight ? "bg-indigo-500/20 text-indigo-400" : "bg-white text-slate-600 shadow-sm"
                }`}>
                  <b.icon className="w-5 h-5" />
                </div>
                <h3 className={`text-base font-semibold mb-2 ${b.highlight ? "text-white" : "text-slate-900"}`}>
                  {b.title}
                </h3>
                <p className={`text-sm leading-relaxed ${b.highlight ? "text-slate-400" : "text-slate-600"}`}>
                  {b.desc}
                </p>
                {b.highlight && (
                  <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full">
                    <Truck className="w-3 h-3" />
                    TO YOUR OFFICE · 1–3 DAYS
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Org types */}
      <section className="py-20 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-500 mb-3">
            Who It&apos;s For
          </p>
          <h2 className="text-3xl font-bold text-slate-900 mb-12">
            Any recognized organization
          </h2>
          <div className="flex flex-wrap gap-3 justify-center">
            {ORG_TYPES.map((o) => (
              <div
                key={o.label}
                className="flex items-center gap-2 bg-white rounded-full px-5 py-3 border border-slate-200 text-sm font-medium text-slate-700 hover:border-slate-400 hover:shadow-sm transition-all cursor-default"
              >
                <o.icon className="w-4 h-4 text-slate-500" />
                {o.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 bg-slate-900">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to streamline your procurement?
          </h2>
          <p className="text-slate-400 mb-10">
            Applications reviewed within 2 business days. No upfront cost.
          </p>
          <button
            onClick={onApply}
            className="inline-flex items-center gap-2 font-semibold text-slate-900 px-10 py-4 rounded-lg bg-white hover:bg-slate-100 transition-all hover:shadow-lg hover:shadow-white/10"
          >
            Apply Now — It&apos;s Free
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-sm text-slate-500 mt-8">
            Questions? Email{" "}
            <a href="mailto:business@shopease.et" className="text-slate-300 hover:text-white underline underline-offset-4">
              business@shopease.et
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   APPLICATION FORM
══════════════════════════════════════════════════════════════════════════════ */

function ApplicationForm({
  onBack,
  onSuccess,
  userId,
}: {
  onBack: () => void;
  onSuccess: () => void;
  userId: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState("");
  const [tinNumber, setTinNumber] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [estimatedSpend, setEstimatedSpend] = useState("");
  const [preferredTerms, setPreferredTerms] = useState<"net_30" | "net_60">("net_30");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!orgName.trim()) errs.orgName = "Organization name is required";
    if (!orgType) errs.orgType = "Please select an organization type";
    if (!contactName.trim()) errs.contactName = "Contact person name is required";
    if (!officeAddress.trim()) errs.officeAddress = "Office delivery address is required";
    if (!selectedFile) errs.document = "Please upload your registration document";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    setSubmitError(null);
    if (!validate()) return;
    setSubmitting(true);

    try {
      let documentUrl: string | null = null;
      let storagePath: string | null = null;

      if (selectedFile) {
        const ext = selectedFile.name.split(".").pop()?.toLowerCase() ?? "pdf";
        const filePath = `business-docs/${userId}/${Date.now()}.${ext}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("business-documents")
          .upload(filePath, selectedFile, { cacheControl: "3600", upsert: false });

        if (uploadError) throw new Error(`Document upload failed: ${uploadError.message}`);

        storagePath = uploadData.path;
        const { data: { publicUrl } } = supabase.storage
          .from("business-documents")
          .getPublicUrl(uploadData.path);
        documentUrl = publicUrl;
      }

      const { error: insertError } = await supabase.from("business_applications").insert({
        user_id: userId,
        org_name: orgName.trim(),
        org_type: orgType,
        tin_number: tinNumber.trim() || null,
        contact_name: contactName.trim(),
        contact_phone: contactPhone.trim() || null,
        office_address: officeAddress.trim(),
        estimated_monthly_spend_cents: estimatedSpend
          ? Math.round(parseFloat(estimatedSpend) * 100)
          : null,
        preferred_payment_terms: preferredTerms,
        document_url: documentUrl,
        storage_path: storagePath,
        status: "pending",
      });

      if (insertError) throw new Error(insertError.message);
      onSuccess();
    } catch (err: unknown) {
      console.error("[business apply] error:", err);
      setSubmitError(err instanceof Error ? err.message : "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setFieldErrors((prev) => ({ ...prev, document: "File must be under 10 MB" }));
      return;
    }
    setSelectedFile(file);
    setFieldErrors((prev) => ({ ...prev, document: "" }));
    e.target.value = "";
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors mb-8 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Hahu Business
        </button>

        <div className="bg-white rounded-xl p-8 md:p-10 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Business Account Application</h1>
              <p className="text-sm text-slate-500">Reviewed within 2 business days</p>
            </div>
          </div>

          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Business accounts require admin approval before credit purchasing is enabled.
              You can continue shopping with your regular account in the meantime.
            </p>
          </div>

          <div className="mt-8 space-y-6">
            {/* Organization Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Organization Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Ethiopian Red Cross Society"
                value={orgName}
                onChange={(e) => {
                  setOrgName(e.target.value);
                  if (fieldErrors.orgName) setFieldErrors((p) => ({ ...p, orgName: "" }));
                }}
                className={`w-full px-4 py-3 rounded-lg border text-sm transition-all focus:outline-none focus:ring-2 ${
                  fieldErrors.orgName
                    ? "border-red-300 focus:border-red-500 focus:ring-red-100"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
                }`}
              />
              {fieldErrors.orgName && (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors.orgName}</p>
              )}
            </div>

            {/* Organization Type */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Organization Type <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ORG_TYPES.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => {
                      setOrgType(o.label);
                      if (fieldErrors.orgType) setFieldErrors((p) => ({ ...p, orgType: "" }));
                    }}
                    className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all border ${
                      orgType === o.label
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <o.icon className="w-4 h-4" />
                    {o.label}
                  </button>
                ))}
              </div>
              {fieldErrors.orgType && (
                <p className="mt-2 text-sm text-red-600">{fieldErrors.orgType}</p>
              )}
            </div>

            {/* TIN + Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  TIN / Registration Number
                </label>
                <input
                  type="text"
                  placeholder="0012345678"
                  value={tinNumber}
                  onChange={(e) => setTinNumber(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Contact Person <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Full name"
                  value={contactName}
                  onChange={(e) => {
                    setContactName(e.target.value);
                    if (fieldErrors.contactName) setFieldErrors((p) => ({ ...p, contactName: "" }));
                  }}
                  className={`w-full px-4 py-3 rounded-lg border text-sm transition-all focus:outline-none focus:ring-2 ${
                    fieldErrors.contactName
                      ? "border-red-300 focus:border-red-500 focus:ring-red-100"
                      : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
                  }`}
                />
                {fieldErrors.contactName && (
                  <p className="mt-1.5 text-sm text-red-600">{fieldErrors.contactName}</p>
                )}
              </div>
            </div>

            {/* Phone + Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    placeholder="+251 9XX XXX XXX"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Work Email
                </label>
                <input
                  type="email"
                  placeholder="contact@organization.et"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                />
              </div>
            </div>

            {/* Spend */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Estimated Monthly Spend (ETB)
              </label>
              <input
                type="number"
                placeholder="50000"
                value={estimatedSpend}
                onChange={(e) => setEstimatedSpend(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Office Delivery Address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-4 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="e.g. Bole Road, Woreda 03, Addis Ababa"
                  value={officeAddress}
                  onChange={(e) => {
                    setOfficeAddress(e.target.value);
                    if (fieldErrors.officeAddress) setFieldErrors((p) => ({ ...p, officeAddress: "" }));
                  }}
                  className={`w-full pl-11 pr-4 py-3 rounded-lg border text-sm transition-all focus:outline-none focus:ring-2 ${
                    fieldErrors.officeAddress
                      ? "border-red-300 focus:border-red-500 focus:ring-red-100"
                      : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
                  }`}
                />
              </div>
              {fieldErrors.officeAddress && (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors.officeAddress}</p>
              )}
              <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" />
                All bulk orders will be delivered to this address in 1–3 business days
              </p>
            </div>

            {/* Terms */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Preferred Payment Terms
              </label>
              <div className="grid grid-cols-2 gap-4">
                {(
                  [
                    { value: "net_30", label: "Net-30", sub: "Pay within 30 days of invoice" },
                    { value: "net_60", label: "Net-60", sub: "Pay within 60 days of invoice" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setPreferredTerms(t.value)}
                    className={`p-4 rounded-lg text-left transition-all border-2 ${
                      preferredTerms === t.value
                        ? "bg-slate-900 border-slate-900"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className={`text-sm font-semibold mb-1 ${
                      preferredTerms === t.value ? "text-white" : "text-slate-900"
                    }`}>
                      {t.label}
                    </div>
                    <div className={`text-xs ${
                      preferredTerms === t.value ? "text-slate-400" : "text-slate-500"
                    }`}>
                      {t.sub}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Document */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Trade License / Registration Certificate <span className="text-red-500">*</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              {selectedFile ? (
                <div className="flex items-center gap-3 p-4 rounded-lg border-2 border-indigo-200 bg-indigo-50">
                  <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                    <FileText className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{selectedFile.name}</p>
                    <p className="text-xs text-slate-500">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFile(null)}
                    className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shadow-sm"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full p-6 rounded-lg border-2 border-dashed text-center transition-all hover:border-indigo-400 hover:bg-indigo-50/50 ${
                    fieldErrors.document ? "border-red-300 bg-red-50" : "border-slate-300 bg-slate-50"
                  }`}
                >
                  <Upload className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                  <p className="text-sm font-medium text-slate-700">Click to upload document</p>
                  <p className="text-xs text-slate-500 mt-1">PDF, JPG, PNG — max 10 MB</p>
                </button>
              )}
              {fieldErrors.document && (
                <p className="mt-2 text-sm text-red-600">{fieldErrors.document}</p>
              )}
            </div>

            {submitError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-4 rounded-lg font-semibold text-white text-base transition-all hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed bg-slate-900 hover:bg-slate-800"
            >
              {submitting ? "Submitting Application…" : "Submit Application"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   PENDING VIEW
══════════════════════════════════════════════════════════════════════════════ */

function PendingView({ application }: { application: BusinessApplication }) {
  const router = useRouter();

  const submittedDate = new Date(application.created_at).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const steps = [
    { label: "Application submitted", sub: submittedDate, done: true },
    { label: "Document verification", sub: "In progress — 1–2 business days", done: false, active: true },
    { label: "Credit limit set by admin", sub: "Pending review completion", done: false },
    { label: "Account activated — email sent", sub: "You'll be notified", done: false },
  ];

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm mb-6">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-amber-600" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold mb-3">
              Under Review
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">Application Submitted</h1>
            <p className="text-sm text-slate-600">
              Our team is reviewing your application for{" "}
              <span className="font-semibold text-slate-900">{application.org_name}</span>
            </p>
          </div>

          <div className="space-y-4 mb-8">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    step.done
                      ? "bg-slate-900 text-white"
                      : step.active
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-400 border-2 border-slate-200"
                  }`}>
                    {step.done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  {i < 3 && (
                    <div className={`w-0.5 h-6 mt-1 ${step.done ? "bg-slate-900" : "bg-slate-200"}`} />
                  )}
                </div>
                <div className="pt-1">
                  <div className={`text-sm font-semibold ${
                    step.done || step.active ? "text-slate-900" : "text-slate-400"
                  }`}>
                    {step.label}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{step.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Application Details
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Organization</span>
                <span className="font-medium text-slate-900">{application.org_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Type</span>
                <span className="font-medium text-slate-900">{application.org_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Contact</span>
                <span className="font-medium text-slate-900">{application.contact_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Preferred Terms</span>
                <span className="font-medium text-slate-900">
                  {formatTerms(application.preferred_payment_terms)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center space-y-4">
          <p className="text-sm text-slate-500">
            Questions? Email{" "}
            <a href="mailto:business@shopease.et" className="text-indigo-600 hover:underline font-medium">
              business@shopease.et
            </a>
          </p>
          <button
            onClick={() => router.push("/shop")}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Continue shopping while you wait
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   REJECTED VIEW
══════════════════════════════════════════════════════════════════════════════ */

function RejectedView({
  application,
  onReapply,
}: {
  application: BusinessApplication;
  onReapply: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl p-8 border border-slate-200 shadow-sm text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-semibold mb-3">
            Not Approved
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Application Declined</h1>
          <p className="text-sm text-slate-600 mb-6">
            Unfortunately, your business account application for{" "}
            <span className="font-semibold text-slate-900">{application.org_name}</span> was not approved.
          </p>

          {application.reviewer_notes && (
            <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left border border-slate-200">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Message from our team
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">{application.reviewer_notes}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={onReapply}
              className="w-full py-3 rounded-lg font-semibold text-white bg-slate-900 hover:bg-slate-800 transition-all"
            >
              Submit New Application
            </button>
            <Link
              href="/shop"
              className="block w-full py-3 rounded-lg font-medium text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors text-center"
            >
              Continue Shopping
            </Link>
          </div>
        </div>

        <div className="text-center text-sm text-slate-500">
          Need help? Email{" "}
          <a href="mailto:business@shopease.et" className="text-indigo-600 hover:underline font-medium">
            business@shopease.et
          </a>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   APPROVED DASHBOARD
   — UPDATED: Added Invoices and Analytics navigation, fixed all hrefs
══════════════════════════════════════════════════════════════════════════════ */

function ApprovedDashboard({
  application,
  businessProfile,
}: {
  application: BusinessApplication | null;
  businessProfile: BusinessProfile;
}) {
  const router = useRouter();

  const [officeAddress, setOfficeAddress] = useState(application?.office_address ?? "");
  const [editingAddress, setEditingAddress] = useState(false);
  const [newAddress, setNewAddress] = useState(application?.office_address ?? "");
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressSaved, setAddressSaved] = useState(false);

  const creditLimit =
    businessProfile.business_credit_limit_cents ??
    application?.approved_credit_limit_cents ??
    0;
  const creditUsed = businessProfile.business_credit_used_cents ?? 0;
  const creditRemaining = Math.max(0, creditLimit - creditUsed);
  const utilPct = creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : 0;
  const terms = businessProfile.business_payment_terms ?? application?.payment_terms ?? null;
  const orgName = businessProfile.business_org_name ?? application?.org_name ?? "Your Organization";

  const daysToAdd = terms === "net_60" ? 60 : 30;
  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + daysToAdd);
  const nextDueStr = nextDue.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  async function handleSaveAddress() {
    const trimmed = newAddress.trim();
    if (!trimmed) {
      setAddressError("Address cannot be empty.");
      return;
    }
    if (!application?.id) return;

    setSavingAddress(true);
    setAddressError(null);

    try {
      const { error } = await supabase
        .from("business_applications")
        .update({ office_address: trimmed })
        .eq("id", application.id);

      if (error) throw error;

      setOfficeAddress(trimmed);
      setEditingAddress(false);
      setAddressSaved(true);
      setTimeout(() => setAddressSaved(false), 3000);
    } catch (err: unknown) {
      setAddressError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSavingAddress(false);
    }
  }

  // UPDATED: Fixed hrefs - Invoices now points to /invoices, added Analytics
  const quickActions = [
    { 
      icon: ShoppingBag, 
      label: "Shop",      
      sub: "Browse products",  
      href: "/shop",       
      primary: true  
    },
    { 
      icon: Package,     
      label: "My Orders", 
      sub: "Track orders",     
      href: "/my-orders",  // FIXED: Changed from /orders to /my-orders (based on your file structure)  
      primary: false 
    },
    { 
      icon: FileText,    
      label: "Invoices",  
      sub: "View & download",  
      href: "/invoices",   // FIXED: Now correctly points to /invoices
      primary: false 
    },
    { 
      icon: BarChart3,   
      label: "Analytics", 
      sub: "Spend reports",    
      href: "/business/analytics",  // ADDED: Links to your existing analytics page
      primary: false 
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      {/* Address Edit Modal */}
      {editingAddress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Update Delivery Address</h2>
                <p className="text-xs text-slate-500 mt-0.5">All future orders will be delivered here</p>
              </div>
              <button
                onClick={() => {
                  setEditingAddress(false);
                  setNewAddress(officeAddress);
                  setAddressError(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Office Delivery Address
              </label>
              <textarea
                rows={3}
                value={newAddress}
                onChange={(e) => {
                  setNewAddress(e.target.value);
                  if (addressError) setAddressError(null);
                }}
                placeholder="e.g. Bole Road, Woreda 03, Addis Ababa"
                className={`w-full px-4 py-3 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-all resize-none ${
                  addressError
                    ? "border-red-300 focus:border-red-500 focus:ring-red-100"
                    : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
                }`}
              />
              {addressError && <p className="mt-1.5 text-sm text-red-600">{addressError}</p>}
            </div>

            <p className="text-xs text-slate-500 mb-6 flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" />
              Deliveries arrive in 1–3 business days
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setEditingAddress(false);
                  setNewAddress(officeAddress);
                  setAddressError(null);
                }}
                className="flex-1 py-2.5 rounded-lg font-medium text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAddress}
                disabled={savingAddress || !application?.id}
                className="flex-1 py-2.5 rounded-lg font-semibold text-sm text-white bg-slate-900 hover:bg-slate-800 transition-all disabled:opacity-60"
              >
                {savingAddress ? "Saving…" : "Save Address"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-6">
        {addressSaved && (
          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <p className="text-sm font-medium text-emerald-800">Delivery address updated successfully</p>
          </div>
        )}

        {/* Header Card */}
        <div className="bg-slate-900 rounded-xl p-6 md:p-8 text-white">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  Approved
                </span>
                <span className="text-xs text-slate-400">{formatTerms(terms)} Terms</span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold mb-1">{orgName}</h1>
              <p className="text-sm text-slate-400">
                {application?.org_type ?? "Business Account"}
                {application?.tin_number && ` · TIN ${application.tin_number}`}
              </p>
            </div>
            <button
              onClick={() => router.push("/shop")}
              className="inline-flex items-center justify-center gap-2 font-semibold text-slate-900 px-6 py-3 rounded-lg bg-white hover:bg-slate-100 transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              Start Shopping
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Credit Limit",   value: creditLimit > 0 ? money(creditLimit) : "—",       sub: "Admin approved"              },
            { label: "Credit Used",    value: money(creditUsed),                                 sub: "This billing cycle"          },
            { label: "Available",      value: creditLimit > 0 ? money(creditRemaining) : "—",   sub: "Ready to spend"              },
            { label: "Next Payment",   value: nextDueStr,                                        sub: `${formatTerms(terms)} from invoice` },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">
                {stat.label}
              </div>
              <div className="text-lg font-bold text-slate-900 mb-1">{stat.value}</div>
              <div className="text-xs text-slate-400">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Credit Utilization */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Credit Utilization</h3>
            <span className={`text-sm font-semibold ${utilPct > 80 ? "text-red-600" : "text-slate-600"}`}>
              {creditLimit > 0 ? `${utilPct}% used` : "No limit set"}
            </span>
          </div>
          <div className="bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                utilPct > 80 ? "bg-red-500" : "bg-indigo-600"
              }`}
              style={{ width: `${utilPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-400">
            <span>ETB 0</span>
            <span>{creditLimit > 0 ? money(creditLimit) : "—"}</span>
          </div>
          {utilPct > 80 && (
            <div className="mt-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                Credit utilization is high. Consider settling outstanding invoices before placing large orders.
              </p>
            </div>
          )}
        </div>

        {/* Quick Actions - UPDATED with 4 items including Invoices and Analytics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={`group bg-white rounded-xl p-5 border text-left transition-all hover:shadow-md ${
                action.primary
                  ? "border-indigo-200 hover:border-indigo-300"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-colors ${
                action.primary
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
              }`}>
                <action.icon className="w-5 h-5" />
              </div>
              <div className="text-sm font-semibold text-slate-900 mb-0.5">{action.label}</div>
              <div className="text-xs text-slate-500">{action.sub}</div>
            </Link>
          ))}
        </div>

        {/* Delivery Address Card */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
              <Truck className="w-6 h-6 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-semibold text-slate-900">Office Delivery Address</h3>
                {application?.id && (
                  <button
                    onClick={() => {
                      setNewAddress(officeAddress);
                      setAddressError(null);
                      setEditingAddress(true);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-600">
                {officeAddress || "No delivery address on file"}
              </p>
              <p className="text-xs text-slate-400 mt-1">Deliveries arrive in 1–3 business days</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════════ */

export default function BusinessPage() {
  const router = useRouter();

  const [view, setView] = useState<PageView>("loading");
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [application, setApplication] = useState<BusinessApplication | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [landingFacts, setLandingFacts] = useState<BusinessLandingFacts | null>(null);
  const [landingFactsLoading, setLandingFactsLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function loadLandingFacts() {
      try {
        const { data, error } = await supabase.rpc("get_business_landing_facts");
        if (!alive) return;

        if (error) {
          console.error("[business landing facts] error:", error);
          setLandingFacts(null);
          return;
        }

        setLandingFacts(normalizeLandingFacts(data));
      } catch (err) {
        console.error("[business landing facts] unexpected error:", err);
        if (alive) setLandingFacts(null);
      } finally {
        if (alive) setLandingFactsLoading(false);
      }
    }

    loadLandingFacts();

    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;

    async function init() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!alive) return;

        if (!user) {
          setIsLoggedIn(false);
          setUserId(null);
          setView("landing");
          return;
        }

        setIsLoggedIn(true);
        setUserId(user.id);

        const { data: prof } = await supabase
          .from("profiles")
          .select(
            "is_business_account, business_credit_limit_cents, business_credit_used_cents, business_payment_terms, business_org_name"
          )
          .eq("id", user.id)
          .maybeSingle();

        if (!alive) return;

        const { data: apps } = await supabase
          .from("business_applications")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (!alive) return;

        const latestApp = (apps?.[0] as BusinessApplication | undefined) ?? null;

        // PRIMARY PATH — profile flag set by admin approval
        if (prof?.is_business_account === true) {
          setBusinessProfile(prof as BusinessProfile);
          setApplication(latestApp); // may be null — ApprovedDashboard handles it
          setView("approved");
          return;
        }

        if (!latestApp) {
          setView("landing");
          return;
        }

        setApplication(latestApp);

        if (latestApp.status === "pending") {
          setView("pending");
        } else if (latestApp.status === "rejected") {
          setView("rejected");
        } else if (latestApp.status === "approved") {
          // FALLBACK PATH — application approved but profile not yet synced
          setBusinessProfile({
            is_business_account: true,
            business_credit_limit_cents: latestApp.approved_credit_limit_cents,
            business_credit_used_cents: 0,
            business_payment_terms: latestApp.payment_terms,
            business_org_name: latestApp.org_name,
          });
          setView("approved");
        } else {
          setView("landing");
        }
      } catch (err) {
        console.error("[business page] init error:", err);
        if (alive) setView("landing");
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (!session?.user) {
        setIsLoggedIn(false);
        setUserId(null);
        setView("landing");
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  function handleApplyCTA() {
    if (!isLoggedIn) {
      router.push(`/auth/login?redirect=/business`);
      return;
    }
    setView("apply");
  }

  function handleApplicationSuccess() {
    setView("loading");
    setTimeout(async () => {
      const { data: apps } = await supabase
        .from("business_applications")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(1);

      const latestApp = apps?.[0] ?? null;
      setApplication(latestApp as BusinessApplication | null);
      setView("pending");
    }, 500);
  }

  function handleReapply() {
    setApplication(null);
    setView("apply");
  }

  if (view === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl mx-auto mb-4 bg-slate-900 flex items-center justify-center">
            <Briefcase className="w-6 h-6 text-white" />
          </div>
          <div className="text-sm font-medium text-slate-600 animate-pulse">
            Loading Hahu Business…
          </div>
        </div>
      </div>
    );
  }

  if (view === "apply" && userId) {
    return (
      <ApplicationForm
        onBack={() => setView("landing")}
        onSuccess={handleApplicationSuccess}
        userId={userId}
      />
    );
  }

  if (view === "pending" && application) {
    return <PendingView application={application} />;
  }

  if (view === "rejected" && application) {
    return <RejectedView application={application} onReapply={handleReapply} />;
  }

  // FIXED: removed && application — businessProfile alone is sufficient
  if (view === "approved" && businessProfile) {
    return <ApprovedDashboard application={application} businessProfile={businessProfile} />;
  }

  return (
    <LandingPage
      onApply={handleApplyCTA}
      isLoggedIn={isLoggedIn}
      landingFacts={landingFacts}
      landingFactsLoading={landingFactsLoading}
    />
  );
}
