// app/admin/public-employee/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  ArrowLeft,
  Search,
  ExternalLink,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Bell,
} from "lucide-react";

type PEDocumentStatus = "pending" | "approved" | "rejected";

type PEDocumentRow = {
  id: string;
  user_id: string;
  employer_name: string | null;
  document_type: string | null;
  document_url: string | null;
  storage_path: string | null;
  status: PEDocumentStatus | string;
  discount_percent: number | null;
  admin_notes: string | null;
  reviewer_notes: string | null;
  product_id: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type ProfileMini = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  email?: string | null;
  gov_employee_status?: string | null;
};

type FilterKey = "all" | PEDocumentStatus;

const STATUS_CONFIG: Record<
  PEDocumentStatus,
  { label: string; icon: string; badge: string; border: string }
> = {
  pending: {
    label: "Pending Review",
    icon: "⏳",
    badge: "bg-amber-100 text-amber-800",
    border: "border-amber-200",
  },
  approved: {
    label: "Approved",
    icon: "✓",
    badge: "bg-emerald-100 text-emerald-800",
    border: "border-emerald-200",
  },
  rejected: {
    label: "Rejected",
    icon: "✕",
    badge: "bg-rose-100 text-rose-800",
    border: "border-rose-200",
  },
};

export default function AdminPublicEmployeePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [newSubmissions, setNewSubmissions] = useState(0);

  const [docs, setDocs] = useState<PEDocumentRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileMini>>({});
  const [activeFilter, setActiveFilter] = useState<FilterKey>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const [savingId, setSavingId] = useState<string | null>(null);
  const [notesInputs, setNotesInputs] = useState<Record<string, string>>({});
  const [reviewerNotesInputs, setReviewerNotesInputs] = useState<Record<string, string>>({});
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({});

  const loadDocs = useCallback(async (_adminId: string) => {
    const { data, error } = await supabase
      .from("public_employee_documents")
      .select(
        "id, user_id, employer_name, document_type, document_url, storage_path, status, discount_percent, admin_notes, reviewer_notes, product_id, created_at, reviewed_at, reviewed_by"
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = (data ?? []) as PEDocumentRow[];
    setDocs(rows);
    setNewSubmissions(0);

    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, full_name, phone, gov_employee_status")
        .in("id", userIds);

      const map: Record<string, ProfileMini> = {};
      (profs ?? []).forEach((p: ProfileMini) => {
        map[p.id] = p;
      });

      // For users with no name in profiles, fall back to auth.users metadata via admin API
      const unnamed = userIds.filter(
        (id) => !map[id]?.display_name && !map[id]?.full_name
      );
      if (unnamed.length > 0) {
        try {
          const res = await fetch(
            `/api/admin/user-names?ids=${unnamed.join(",")}`
          );
          if (res.ok) {
            const { names } = await res.json();
            for (const id of unnamed) {
              if (names[id]) {
                map[id] = { ...(map[id] ?? { id, phone: null, gov_employee_status: null, display_name: null, full_name: null }), full_name: names[id] };
              }
            }
          }
        } catch {
          // best-effort — silently ignore if auth metadata fetch fails
        }
      }

      setProfilesById(map);
    }

    const notes: Record<string, string> = {};
    const rnotes: Record<string, string> = {};
    const discounts: Record<string, string> = {};
    rows.forEach((d) => {
      if (d.admin_notes) notes[d.id] = d.admin_notes;
      if (d.reviewer_notes) rnotes[d.id] = d.reviewer_notes;
      if (d.discount_percent != null) discounts[d.id] = String(d.discount_percent);
    });
    setNotesInputs(notes);
    setReviewerNotesInputs(rnotes);
    setDiscountInputs(discounts);
  }, []);

  useEffect(() => {
    let alive = true;

    async function init() {
      setLoading(true);
      setPageError(null);

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.push("/auth/login");
          return;
        }

        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profErr) throw profErr;
        if (!profile || profile.role !== "admin") {
          if (!alive) return;
          setPageError("Admin access required");
          setLoading(false);
          setAuthorized(false);
          return;
        }

        if (!alive) return;
        setAuthorized(true);
        await loadDocs(session.user.id);
      } catch (err: any) {
        if (!alive) return;
        setPageError(err?.message ?? "Failed to load.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    init();

    const channel = supabase
      .channel("pe_docs_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "public_employee_documents" },
        () => {
          if (alive) setNewSubmissions((n) => n + 1);
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [router, loadDocs]);

  const counts = useMemo(
    () => ({
      all: docs.length,
      pending: docs.filter((d) => d.status === "pending").length,
      approved: docs.filter((d) => d.status === "approved").length,
      rejected: docs.filter((d) => d.status === "rejected").length,
    }),
    [docs]
  );

  const filteredDocs = useMemo(() => {
    let result =
      activeFilter === "all" ? docs : docs.filter((d) => d.status === activeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d) => {
        const profile = profilesById[d.user_id];
        return (
          profile?.full_name?.toLowerCase().includes(q) ||
          profile?.phone?.toLowerCase().includes(q) ||
          d.employer_name?.toLowerCase().includes(q) ||
          d.user_id.toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [docs, activeFilter, searchQuery, profilesById]);

  async function handleAction(doc: PEDocumentRow, action: PEDocumentStatus) {
    setPageError(null);
    setSavingId(doc.id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const discountRaw = discountInputs[doc.id];
      const discount = discountRaw ? parseInt(discountRaw, 10) : null;

      // 1. Update the document row
      const { data: updatedDoc, error: docError } = await supabase
        .from("public_employee_documents")
        .update({
          status: action,
          discount_percent: discount,
          admin_notes: notesInputs[doc.id] || null,
          reviewer_notes: reviewerNotesInputs[doc.id] || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: session?.user?.id ?? null,
        })
        .eq("id", doc.id)
        .select()
        .single();

      if (docError) throw docError;

      // 2. Update profile for ALL actions including revert
      const profileUpdate: Record<string, any> = {
        gov_employee_status: action,
        updated_at: new Date().toISOString(),
      };

      if (action === "approved") {
        profileUpdate.is_public_employee = true;
        profileUpdate.public_employee_discount_percent = discount ?? 10;
      } else {
        // rejected or reverted to pending
        profileUpdate.is_public_employee = false;
        profileUpdate.public_employee_discount_percent = null;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update(profileUpdate)
        .eq("id", doc.user_id);

      if (profileError) throw profileError;

      setDocs((prev) =>
        prev.map((d) => (d.id === doc.id ? (updatedDoc as PEDocumentRow) : d))
      );

      setExpandedDoc(null);
    } catch (err: any) {
      setPageError(err?.message ?? "Action failed.");
    } finally {
      setSavingId(null);
    }
  }

  function isImageUrl(url: string | null) {
    if (!url) return false;
    return /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-600 text-sm font-medium">Loading...</span>
        </div>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="text-5xl mb-4">🚫</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>
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

  return (
    <main className="min-h-screen px-4 py-6 md:px-8 md:py-10 bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">
                  Admin
                </span>
                {counts.pending > 0 && (
                  <span className="text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1 rounded-full">
                    {counts.pending} pending
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-black text-slate-900">
                Public Employee Verification
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Review and approve public employee discount applications.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {newSubmissions > 0 && (
                <button
                  onClick={() => loadDocs("")}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-bold hover:bg-amber-100 transition-colors animate-pulse"
                >
                  <Bell className="w-4 h-4" />
                  {newSubmissions} new — refresh
                </button>
              )}
              <button
                onClick={() => loadDocs("")}
                className="p-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => router.push("/admin")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Dashboard
              </button>
            </div>
          </div>

          {pageError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {pageError}
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {(["pending", "approved", "rejected", "all"] as const).map((key) => {
              const colors = {
                pending: { active: "border-amber-500 bg-amber-50", number: "text-amber-700" },
                approved: { active: "border-emerald-500 bg-emerald-50", number: "text-emerald-700" },
                rejected: { active: "border-rose-500 bg-rose-50", number: "text-rose-700" },
                all: { active: "border-slate-700 bg-slate-50", number: "text-slate-700" },
              }[key];
              const isActive = activeFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveFilter(key)}
                  className={[
                    "p-4 rounded-2xl border-2 transition-all text-left",
                    isActive ? colors.active : "border-slate-100 bg-white hover:border-slate-200",
                  ].join(" ")}
                >
                  <div className={["text-2xl font-black", colors.number].join(" ")}>
                    {counts[key]}
                  </div>
                  <div className="text-xs font-bold text-slate-500 uppercase capitalize">
                    {key}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="mt-4 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, phone, or employer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-10 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Results count */}
        {searchQuery && (
          <p className="text-sm text-slate-500 px-1">
            {filteredDocs.length} result{filteredDocs.length !== 1 ? "s" : ""} for &quot;
            {searchQuery}&quot;
          </p>
        )}

        {/* List */}
        <div className="space-y-4">
          {filteredDocs.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
              <div className="text-5xl mb-4">📭</div>
              <p className="text-lg font-bold text-slate-900">No applications found</p>
              <p className="text-sm text-slate-500">
                {searchQuery ? "Try a different search term" : "All caught up!"}
              </p>
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const status = (doc.status as PEDocumentStatus) || "pending";
              const config = STATUS_CONFIG[status];
              const isSaving = savingId === doc.id;
              const profile = profilesById[doc.user_id];
              const isExpanded = expandedDoc === doc.id;
              const isImage = isImageUrl(doc.document_url);

              return (
                <div
                  key={doc.id}
                  className={[
                    "bg-white rounded-3xl border-2 shadow-sm transition-all duration-200",
                    isExpanded ? config.border : "border-slate-100 hover:border-slate-200",
                  ].join(" ")}
                >
                  {/* Card Header */}
                  <button
                    type="button"
                    onClick={() => setExpandedDoc(isExpanded ? null : doc.id)}
                    className="w-full text-left p-6 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div
                        className={[
                          "w-2.5 h-2.5 rounded-full flex-shrink-0",
                          status === "pending"
                            ? "bg-amber-400 animate-pulse"
                            : status === "approved"
                            ? "bg-emerald-500"
                            : "bg-rose-500",
                        ].join(" ")}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 truncate">
                            {profile?.display_name || profile?.full_name || "Unknown User"}
                          </span>
                          <span
                            className={[
                              "px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide",
                              config.badge,
                            ].join(" ")}
                          >
                            {config.icon} {config.label}
                          </span>
                          {doc.discount_percent && status === "approved" && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-700">
                              {doc.discount_percent}% discount
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                          {profile?.phone && <span>{profile.phone}</span>}
                          {doc.employer_name && (
                            <span className="font-semibold text-slate-700">
                              {doc.employer_name}
                            </span>
                          )}
                          <span>
                            📅{" "}
                            {new Date(doc.created_at).toLocaleDateString("en-US", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                          {doc.reviewed_at && (
                            <span className="text-emerald-600">
                              ✓ Reviewed{" "}
                              {new Date(doc.reviewed_at).toLocaleDateString()}
                            </span>
                          )}
                          {doc.product_id && (
                            <span className="text-purple-600 font-semibold">
                              🛍️ From product page
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-slate-400">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-6 pb-6 border-t border-slate-100 pt-5">
                      <div className="flex flex-col lg:flex-row gap-6">
                        {/* Left: Document Preview */}
                        <div className="lg:w-80 flex-shrink-0 space-y-3">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Submitted Document
                          </h3>
                          {doc.document_url ? (
                            <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                              {isImage ? (
                                <div className="relative">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={doc.document_url}
                                    alt="Employee document"
                                    className="w-full max-h-72 object-contain bg-slate-100 p-2"
                                  />
                                  <a
                                    href={doc.document_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="absolute top-2 right-2 p-2 bg-black/60 text-white rounded-lg hover:bg-black/80 transition-colors"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3 p-4">
                                  <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                                    <FileText className="w-6 h-6 text-red-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-700 truncate">
                                      {doc.document_type === "application/pdf"
                                        ? "PDF Document"
                                        : "Document"}
                                    </p>
                                    <p className="text-xs text-slate-500 truncate">
                                      {doc.storage_path}
                                    </p>
                                  </div>
                                </div>
                              )}
                              <div className="px-3 pb-3">
                                <a
                                  href={doc.document_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 transition-colors"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                  Open full document
                                </a>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-400">
                              <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p className="text-sm font-medium">No document uploaded</p>
                            </div>
                          )}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex-1 space-y-4">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Review Actions
                          </h3>

                          {/* Discount */}
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                              Discount % (applied if approved)
                            </label>
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                type="number"
                                min="1"
                                max="100"
                                value={discountInputs[doc.id] ?? ""}
                                onChange={(e) =>
                                  setDiscountInputs((prev) => ({
                                    ...prev,
                                    [doc.id]: e.target.value,
                                  }))
                                }
                                placeholder="e.g. 20"
                                className="w-28 p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                              <span className="text-sm text-slate-500">%</span>
                              <div className="flex gap-1">
                                {[10, 20, 30, 50].map((pct) => (
                                  <button
                                    key={pct}
                                    type="button"
                                    onClick={() =>
                                      setDiscountInputs((prev) => ({
                                        ...prev,
                                        [doc.id]: String(pct),
                                      }))
                                    }
                                    className={[
                                      "px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors",
                                      discountInputs[doc.id] === String(pct)
                                        ? "bg-blue-600 text-white"
                                        : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                    ].join(" ")}
                                  >
                                    {pct}%
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Admin Notes */}
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                              Admin Notes{" "}
                              <span className="text-slate-400 font-normal normal-case">
                                (internal only)
                              </span>
                            </label>
                            <textarea
                              value={notesInputs[doc.id] ?? ""}
                              onChange={(e) =>
                                setNotesInputs((prev) => ({
                                  ...prev,
                                  [doc.id]: e.target.value,
                                }))
                              }
                              placeholder="Internal notes about this application..."
                              className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                              rows={2}
                            />
                          </div>

                          {/* Reviewer Notes */}
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                              Message to Applicant{" "}
                              <span className="text-slate-400 font-normal normal-case">
                                (visible to user)
                              </span>
                            </label>
                            <textarea
                              value={reviewerNotesInputs[doc.id] ?? ""}
                              onChange={(e) =>
                                setReviewerNotesInputs((prev) => ({
                                  ...prev,
                                  [doc.id]: e.target.value,
                                }))
                              }
                              placeholder={
                                status === "pending"
                                  ? "Reason for approval or rejection..."
                                  : doc.reviewer_notes || "No message sent"
                              }
                              className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                              rows={2}
                            />
                          </div>

                          {/* Action Buttons */}
                          {status === "pending" ? (
                            <div className="flex gap-3 pt-1">
                              <button
                                onClick={() => handleAction(doc, "approved")}
                                disabled={isSaving}
                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50"
                              >
                                {isSaving ? (
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <CheckCircle className="w-4 h-4" />
                                )}
                                Approve
                              </button>
                              <button
                                onClick={() => handleAction(doc, "rejected")}
                                disabled={isSaving}
                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-500/25 hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50"
                              >
                                {isSaving ? (
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <XCircle className="w-4 h-4" />
                                )}
                                Reject
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-3 pt-1 flex-wrap">
                              {status === "rejected" && (
                                <button
                                  onClick={() => handleAction(doc, "approved")}
                                  disabled={isSaving}
                                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 transition-all disabled:opacity-50"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  Approve instead
                                </button>
                              )}
                              {status === "approved" && (
                                <button
                                  onClick={() => handleAction(doc, "rejected")}
                                  disabled={isSaving}
                                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-500 text-white font-bold text-sm hover:bg-rose-600 transition-all disabled:opacity-50"
                                >
                                  <XCircle className="w-4 h-4" />
                                  Revoke approval
                                </button>
                              )}
                              <button
                                onClick={() => handleAction(doc, "pending")}
                                disabled={isSaving}
                                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-50"
                              >
                                {isSaving ? (
                                  <div className="w-4 h-4 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <RotateCcw className="w-4 h-4" />
                                )}
                                Revert to Pending
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}