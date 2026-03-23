// app/admin/sellers/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type SellerDocumentStatus = "pending" | "approved" | "rejected";

type SellerDocumentRow = {
  id: string;
  seller_id: string;
  document_type: string;
  file_url: string;
  status: SellerDocumentStatus | string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type FilterKey = "all" | SellerDocumentStatus;

const STATUS_CONFIG: Record<
  SellerDocumentStatus,
  { label: string; icon: string; badge: string }
> = {
  pending: {
    label: "Pending Review",
    icon: "⏳",
    badge: "bg-amber-100 text-amber-800",
  },
  approved: {
    label: "Approved",
    icon: "✓",
    badge: "bg-emerald-100 text-emerald-800",
  },
  rejected: {
    label: "Rejected",
    icon: "✕",
    badge: "bg-rose-100 text-rose-800",
  },
};

const FILTER_BTN: Record<
  "pending" | "approved" | "rejected" | "all",
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

export default function AdminSellerVerificationPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [docs, setDocs] = useState<SellerDocumentRow[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("pending");

  const [savingId, setSavingId] = useState<string | null>(null);
  const [notesInputs, setNotesInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;

    async function load() {
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
          setPageError("Admin access required");
          setLoading(false);
          return;
        }

        if (!alive) return;
        setAuthorized(true);

        const { data, error } = await supabase
          .from("seller_documents")
          .select(
            "id, seller_id, document_type, file_url, status, admin_notes, created_at, reviewed_at, reviewed_by"
          )
          .order("created_at", { ascending: false });

        if (error) throw error;

        const rows = (data ?? []) as SellerDocumentRow[];

        if (!alive) return;
        setDocs(rows);

        const initialNotes: Record<string, string> = {};
        rows.forEach((d) => {
          if (d.admin_notes) initialNotes[d.id] = d.admin_notes;
        });
        setNotesInputs(initialNotes);
      } catch (err: any) {
        if (!alive) return;
        setPageError(err?.message ?? "Failed to load seller documents.");
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
    if (activeFilter === "all") return docs;
    return docs.filter((d) => d.status === activeFilter);
  }, [docs, activeFilter]);

  async function updateDocument(id: string, updates: Partial<SellerDocumentRow>) {
    setPageError(null);
    setSavingId(id);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const payload = {
        ...updates,
        reviewed_at: new Date().toISOString(),
        reviewed_by: session?.user?.id ?? null,
      };

      const { data, error } = await supabase
        .from("seller_documents")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      setDocs((prev) =>
        prev.map((d) => (d.id === id ? (data as SellerDocumentRow) : d))
      );

      return data as SellerDocumentRow;
    } catch (err: any) {
      setPageError(err?.message ?? "Failed to update document.");
      return null;
    } finally {
      setSavingId(null);
    }
  }

  // ✅ A) Promote seller role on approve
  async function promoteSellerRole(sellerId: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ role: "seller" })
      .eq("id", sellerId);

    if (error) throw error;
  }

  async function handleAction(
    doc: SellerDocumentRow,
    action: "approved" | "rejected" | "pending"
  ) {
    const updated = await updateDocument(doc.id, { status: action });
    if (!updated) return;

    if (action === "approved") {
      try {
        setSavingId(doc.id);
        await promoteSellerRole(doc.seller_id);
      } catch (err: any) {
        setPageError(
          err?.message ??
            "Document approved, but failed to update profiles.role to seller."
        );
      } finally {
        setSavingId(null);
      }
    }
  }

  async function handleSaveNotes(id: string) {
    await updateDocument(id, { admin_notes: notesInputs[id] ?? "" });
  }

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
                Seller Verification
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Approving a document also promotes the user to{" "}
                <span className="font-semibold">profiles.role = seller</span>.
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
                  <div className={["text-2xl font-black", cfg.number].join(" ")}>
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

        {/* List */}
        <div className="space-y-4">
          {filteredDocs.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
              <div className="text-5xl mb-4">📭</div>
              <p className="text-lg font-bold text-slate-900">
                No documents found
              </p>
              <p className="text-sm text-slate-500">All caught up!</p>
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const status = (doc.status as SellerDocumentStatus) || "pending";
              const config = STATUS_CONFIG[status];
              const isSaving = savingId === doc.id;

              return (
                <div
                  key={doc.id}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Info */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={[
                            "px-3 py-1 rounded-full text-xs font-black uppercase tracking-wide",
                            config.badge,
                          ].join(" ")}
                        >
                          {config.icon} {config.label}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {doc.id.slice(0, 8)}
                        </span>
                      </div>

                      <div>
                        <h3 className="text-lg font-bold text-slate-900 capitalize">
                          {doc.document_type.replace(/_/g, " ")}
                        </h3>
                        <p className="text-sm text-slate-500">
                          Seller:{" "}
                          <span className="font-mono">
                            {doc.seller_id.slice(0, 12)}...
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>📅 {new Date(doc.created_at).toLocaleDateString()}</span>
                        {doc.reviewed_at && (
                          <span>
                            ✓ Reviewed {new Date(doc.reviewed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 transition-colors"
                      >
                        View Document
                      </a>
                    </div>

                    {/* Actions */}
                    <div className="lg:w-96 space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                          Admin Notes (visible to seller)
                        </label>
                        <textarea
                          value={notesInputs[doc.id] ?? doc.admin_notes ?? ""}
                          onChange={(e) =>
                            setNotesInputs((prev) => ({
                              ...prev,
                              [doc.id]: e.target.value,
                            }))
                          }
                          placeholder="Add notes about this document..."
                          className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          rows={3}
                        />
                        <button
                          onClick={() => handleSaveNotes(doc.id)}
                          disabled={isSaving}
                          className="mt-2 text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          {isSaving ? "Saving..." : "Save Notes"}
                        </button>
                      </div>

                      {status === "pending" ? (
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleAction(doc, "approved")}
                            disabled={isSaving}
                            className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 active:scale-95 transition-all disabled:opacity-50"
                          >
                            ✓ Approve + Enable Seller
                          </button>
                          <button
                            onClick={() => handleAction(doc, "rejected")}
                            disabled={isSaving}
                            className="flex-1 py-3 rounded-xl bg-rose-500 text-white font-bold text-sm shadow-lg shadow-rose-500/25 hover:bg-rose-600 active:scale-95 transition-all disabled:opacity-50"
                          >
                            ✕ Reject
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAction(doc, "pending")}
                          disabled={isSaving}
                          className="w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                          ↩ Revert to Pending
                        </button>
                      )}

                      <div className="text-[11px] text-slate-500">
                        Note: We auto-promote on approve. We do not auto-demote on reject/pending.
                      </div>
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
