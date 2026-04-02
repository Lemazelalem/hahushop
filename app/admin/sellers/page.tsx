// app/admin/sellers/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* ─── Types ──────────────────────────────────────────────── */

type DocRow = {
  id: string;
  seller_id: string;
  document_type: string;
  file_url: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
};

type AppRow = {
  id: string;
  user_id: string;
  business_name: string | null;
  status: string;
  applied_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  business_name: string | null;
  role: string | null;
  seller_status: string | null;
};

type SellerView = {
  id: string;
  name: string;
  contact: string;
  businessName: string;
  role: string | null;
  sellerStatus: string | null;
  appliedAt: string | null;
  applicationId: string | null;
  applicationStatus: string | null;
  productCount: number;
  documents: DocRow[];
  /** Computed approval state shown in UI */
  approvalState: "pending" | "approved" | "rejected";
};

type FilterKey = "all" | "pending" | "approved" | "rejected";

const FILTER_BTN: Record<
  FilterKey,
  { active: string; idle: string; number: string }
> = {
  pending: {
    active: "border-amber-500 bg-amber-50",
    idle: "border-slate-100 bg-white hover:border-slate-200",
    number: "text-amber-700",
  },
  approved: {
    active: "border-emerald-500 bg-emerald-50",
    idle: "border-slate-100 bg-white hover:border-slate-200",
    number: "text-emerald-700",
  },
  rejected: {
    active: "border-rose-500 bg-rose-50",
    idle: "border-slate-100 bg-white hover:border-slate-200",
    number: "text-rose-700",
  },
  all: {
    active: "border-slate-700 bg-slate-50",
    idle: "border-slate-100 bg-white hover:border-slate-200",
    number: "text-slate-700",
  },
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/* ─── Page ───────────────────────────────────────────────── */

export default function AdminSellerVerificationPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [sellers, setSellers] = useState<SellerView[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("pending");
  const [savingId, setSavingId] = useState<string | null>(null);

  /* ── Load all seller data via server API (bypasses RLS) ── */
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setPageError(null);

      try {
        // Quick auth check (own profile is readable via RLS)
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push("/auth/login");
          return;
        }

        const { data: adminProfile, error: profErr } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profErr) throw profErr;
        if (!adminProfile || adminProfile.role !== "admin") {
          setPageError("Admin access required");
          setLoading(false);
          return;
        }

        if (!alive) return;
        setAuthorized(true);

        // Fetch ALL seller data via server API (uses service role key, bypasses RLS)
        const res = await fetch("/api/admin/sellers");
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? "Failed to load sellers");
        }

        const data = await res.json();
        const profiles = (data.profiles ?? []) as ProfileRow[];
        const apps = (data.applications ?? []) as AppRow[];
        const docs = (data.documents ?? []) as DocRow[];
        const products = (data.products ?? []) as { seller_id: string | null }[];

        if (!alive) return;

        // Build lookup maps
        const profileMap = new Map<string, ProfileRow>();
        profiles.forEach((p) => profileMap.set(p.id, p));

        const appMap = new Map<string, AppRow>();
        apps.forEach((a) => {
          if (!appMap.has(a.user_id)) appMap.set(a.user_id, a);
        });

        const docMap = new Map<string, DocRow[]>();
        docs.forEach((d) => {
          const list = docMap.get(d.seller_id) ?? [];
          list.push(d);
          docMap.set(d.seller_id, list);
        });

        const productCountMap = new Map<string, number>();
        products.forEach((p) => {
          if (p.seller_id) {
            productCountMap.set(
              p.seller_id,
              (productCountMap.get(p.seller_id) ?? 0) + 1
            );
          }
        });

        // Collect ALL unique seller IDs
        const sellerIdSet = new Set<string>();
        apps.forEach((a) => sellerIdSet.add(a.user_id));
        docs.forEach((d) => sellerIdSet.add(d.seller_id));
        products.forEach((p) => {
          if (p.seller_id) sellerIdSet.add(p.seller_id);
        });
        profiles.forEach((p) => sellerIdSet.add(p.id));

        // Remove admin's own ID and any admin-role profiles
        sellerIdSet.delete(session.user.id);
        profiles.forEach((p) => {
          if (p.role === "admin") sellerIdSet.delete(p.id);
        });

        const sellerIds = [...sellerIdSet];

        // Build seller views
        const views: SellerView[] = sellerIds.map((sid) => {
          const profile = profileMap.get(sid);
          const app = appMap.get(sid);
          const sellerDocs = docMap.get(sid) ?? [];

          const name =
            profile?.display_name?.trim() ||
            profile?.full_name?.trim() ||
            app?.business_name?.trim() ||
            profile?.business_name?.trim() ||
            "Unknown";

          const isRejected =
            profile?.seller_status === "rejected" ||
            app?.status === "rejected";
          const isRoleSeller = profile?.role === "seller";
          const isStatusApproved =
            !isRejected && (profile?.seller_status === "approved" || isRoleSeller);

          let approvalState: "pending" | "approved" | "rejected" = "pending";
          if (isStatusApproved) approvalState = "approved";
          else if (isRejected) approvalState = "rejected";

          return {
            id: sid,
            name,
            contact: profile?.phone?.trim() || "No contact",
            businessName:
              app?.business_name?.trim() ||
              profile?.business_name?.trim() ||
              "",
            role: profile?.role ?? null,
            sellerStatus: profile?.seller_status ?? null,
            appliedAt: app?.applied_at ?? null,
            applicationId: app?.id ?? null,
            applicationStatus: app?.status ?? null,
            productCount: productCountMap.get(sid) ?? 0,
            documents: sellerDocs,
            approvalState,
          };
        });

        // Sort: pending first, then rejected, then approved
        const order = { pending: 0, rejected: 1, approved: 2 };
        views.sort(
          (a, b) => order[a.approvalState] - order[b.approvalState]
        );

        setSellers(views);
      } catch (error: unknown) {
        if (!alive) return;
        setPageError(errorMessage(error, "Failed to load sellers."));
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [router]);

  /* ── Counts ── */
  const counts = useMemo(
    () => ({
      all: sellers.length,
      pending: sellers.filter((s) => s.approvalState === "pending").length,
      approved: sellers.filter((s) => s.approvalState === "approved").length,
      rejected: sellers.filter((s) => s.approvalState === "rejected").length,
    }),
    [sellers]
  );

  const filteredSellers = useMemo(() => {
    if (activeFilter === "all") return sellers;
    return sellers.filter((s) => s.approvalState === activeFilter);
  }, [sellers, activeFilter]);

  /* ── Approve seller: call server API to promote role + update statuses ── */
  async function handleApprove(seller: SellerView) {
    setPageError(null);
    setSavingId(seller.id);

    try {
      const pendingDocIds = seller.documents
        .filter((d) => d.status === "pending")
        .map((d) => d.id);

      const res = await fetch("/api/admin/sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          sellerId: seller.id,
          applicationId: seller.applicationId,
          documentIds: pendingDocIds,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to approve seller.");

      // Update local state
      setSellers((prev) =>
        prev.map((s) =>
          s.id === seller.id
            ? {
                ...s,
                role: "seller",
                sellerStatus: "approved",
                applicationStatus: "approved",
                approvalState: "approved" as const,
                documents: s.documents.map((d) =>
                  d.status === "pending" ? { ...d, status: "approved" } : d
                ),
              }
            : s
        )
      );
    } catch (error: unknown) {
      setPageError(errorMessage(error, "Failed to approve seller."));
    } finally {
      setSavingId(null);
    }
  }

  /* ── Reject seller ── */
  async function handleReject(seller: SellerView) {
    setPageError(null);
    setSavingId(seller.id);

    try {
      const res = await fetch("/api/admin/sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          sellerId: seller.id,
          applicationId: seller.applicationId,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to reject seller.");

      setSellers((prev) =>
        prev.map((s) =>
          s.id === seller.id
            ? {
                ...s,
                sellerStatus: "rejected",
                applicationStatus: "rejected",
                approvalState: "rejected" as const,
              }
            : s
        )
      );
    } catch (error: unknown) {
      setPageError(errorMessage(error, "Failed to reject seller."));
    } finally {
      setSavingId(null);
    }
  }

  /* ── Revert to pending ── */
  async function handleRevert(seller: SellerView) {
    setPageError(null);
    setSavingId(seller.id);

    try {
      const res = await fetch("/api/admin/sellers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revert",
          sellerId: seller.id,
          applicationId: seller.applicationId,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to revert seller.");

      setSellers((prev) =>
        prev.map((s) =>
          s.id === seller.id
            ? {
                ...s,
                sellerStatus: "pending",
                applicationStatus: "pending",
                approvalState: "pending" as const,
              }
            : s
        )
      );
    } catch (error: unknown) {
      setPageError(errorMessage(error, "Failed to revert seller."));
    } finally {
      setSavingId(null);
    }
  }

  /* ── Loading / Access Denied ── */

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-600 text-sm font-medium">Loading...</span>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
        <div className="text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Access Denied
          </h1>
          <p className="text-slate-600 mb-6">{pageError}</p>
          <button
            onClick={() => router.push("/auth/login")}
            className="px-6 py-2.5 bg-emerald-500 text-white font-bold rounded-xl"
          >
            Go to Login
          </button>
        </div>
      </main>
    );
  }

  /* ── Main Render ── */

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10 bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">
                  Admin
                </span>
              </div>
              <h1 className="text-3xl font-black text-slate-900">
                Seller Approvals
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Review seller applications. Approving grants{" "}
                <span className="font-semibold">seller dashboard access</span>.
              </p>
            </div>
            <button
              onClick={() => router.push("/admin")}
              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 transition-colors"
            >
              ← Back to Dashboard
            </button>
          </div>

          {pageError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {pageError}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {(
              [
                { key: "pending", label: "Pending" },
                { key: "approved", label: "Approved" },
                { key: "rejected", label: "Rejected" },
                { key: "all", label: "Total" },
              ] as const
            ).map((stat) => {
              const cfg = FILTER_BTN[stat.key];
              const isActive = activeFilter === stat.key;
              return (
                <button
                  key={stat.key}
                  onClick={() => setActiveFilter(stat.key as FilterKey)}
                  className={[
                    "p-4 rounded-2xl border-2 transition-all text-left",
                    isActive ? cfg.active : cfg.idle,
                  ].join(" ")}
                >
                  <div
                    className={["text-2xl font-black", cfg.number].join(" ")}
                  >
                    {counts[stat.key]}
                  </div>
                  <div className="text-xs font-bold text-slate-500 uppercase">
                    {stat.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Seller List */}
        <div className="space-y-4">
          {filteredSellers.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
              <div className="text-5xl mb-4">📭</div>
              <p className="text-lg font-bold text-slate-900">
                No sellers found
              </p>
              <p className="text-sm text-slate-500">All caught up!</p>
            </div>
          ) : (
            filteredSellers.map((seller) => {
              const isSaving = savingId === seller.id;
              const badgeCls =
                seller.approvalState === "approved"
                  ? "bg-emerald-100 text-emerald-800"
                  : seller.approvalState === "rejected"
                  ? "bg-rose-100 text-rose-800"
                  : "bg-amber-100 text-amber-800";
              const badgeLabel =
                seller.approvalState === "approved"
                  ? "✓ Approved"
                  : seller.approvalState === "rejected"
                  ? "✕ Rejected"
                  : "⏳ Pending";

              return (
                <div
                  key={seller.id}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Seller Info */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span
                          className={[
                            "px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide",
                            badgeCls,
                          ].join(" ")}
                        >
                          {badgeLabel}
                        </span>
                        {seller.role === "seller" && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                            HAS ROLE
                          </span>
                        )}
                        <span className="text-xs text-slate-400 font-mono">
                          {seller.id.slice(0, 12)}…
                        </span>
                      </div>

                      <div>
                        <h3 className="text-lg font-bold text-slate-900">
                          {seller.name}
                        </h3>
                        {seller.businessName && (
                          <p className="text-sm text-slate-600">
                            🏪 {seller.businessName}
                          </p>
                        )}
                        <p className="text-sm text-slate-500">
                          📱 {seller.contact}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                        {seller.appliedAt && (
                          <span>
                            📅 Applied{" "}
                            {new Date(seller.appliedAt).toLocaleDateString()}
                          </span>
                        )}
                        <span>📦 {seller.productCount} products</span>
                      </div>

                      {/* Documents */}
                      {seller.documents.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-bold text-slate-500 uppercase mb-1">
                            Documents ({seller.documents.length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {seller.documents.map((doc) => (
                              <a
                                key={doc.id}
                                href={doc.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 hover:bg-slate-100 transition-colors"
                              >
                                📄{" "}
                                {doc.document_type.replace(/_/g, " ")}
                                <span
                                  className={[
                                    "ml-1 w-2 h-2 rounded-full inline-block",
                                    doc.status === "approved"
                                      ? "bg-emerald-500"
                                      : doc.status === "rejected"
                                      ? "bg-rose-500"
                                      : "bg-amber-500",
                                  ].join(" ")}
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="lg:w-72 space-y-3 flex flex-col justify-center">
                      {seller.approvalState === "pending" ? (
                        <>
                          <button
                            onClick={() => handleApprove(seller)}
                            disabled={isSaving}
                            className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50"
                          >
                            {isSaving
                              ? "Approving..."
                              : "✓ Approve — Grant Seller Access"}
                          </button>
                          <button
                            onClick={() => handleReject(seller)}
                            disabled={isSaving}
                            className="w-full py-3 rounded-xl bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-500/25 hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50"
                          >
                            ✕ Reject
                          </button>
                        </>
                      ) : seller.approvalState === "approved" ? (
                        <button
                          onClick={() => handleRevert(seller)}
                          disabled={isSaving}
                          className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                          ↩ Revert to Pending
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => handleApprove(seller)}
                            disabled={isSaving}
                            className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50"
                          >
                            ✓ Approve — Grant Seller Access
                          </button>
                          <button
                            onClick={() => handleRevert(seller)}
                            disabled={isSaving}
                            className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-50"
                          >
                            ↩ Revert to Pending
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
