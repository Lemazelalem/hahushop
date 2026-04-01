// app/seller/verification/page.tsx
"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getProfileRoleWithTimeout,
  getRoleHintFromUser,
  syncProfileFromAuthUser,
} from "@/lib/authProfile";

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

const STORAGE_BUCKET = "seller_documents"; // must match your Supabase bucket name

function humanDocumentType(docType: string) {
  return docType
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function labelStatus(status: SellerDocumentStatus | string) {
  if (status === "pending") return "Pending review";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return status || "Unknown";
}

function prettyError(err: any) {
  if (!err) return "Unknown error.";
  if (typeof err === "string") return err;
  if (err.message) return err.message;
  if (err.error_description) return err.error_description;
  if (err.details) return err.details;
  if (err.hint) return err.hint;
  try {
    return JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
}

export default function SellerVerificationPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const isApprovedSeller = (role ?? "").toLowerCase() === "seller";

  const [documentType, setDocumentType] =
    useState<"business_license" | "tax_id" | "id_card">("business_license");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  const [docs, setDocs] = useState<SellerDocumentRow[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  // Refresh controls
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const counts = useMemo(() => {
    const base = {
      all: docs.length,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const d of docs) {
      const s = (d.status as SellerDocumentStatus) || "pending";
      if (s === "pending") base.pending += 1;
      else if (s === "approved") base.approved += 1;
      else if (s === "rejected") base.rejected += 1;
    }
    return base;
  }, [docs]);

  const filterTabs: { key: FilterKey; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
    { key: "all", label: "All" },
  ];

  const filteredDocs = useMemo(() => {
    if (!docs.length) return [];
    if (activeFilter === "all") return docs;
    return docs.filter((d) => (d.status as SellerDocumentStatus) === activeFilter);
  }, [docs, activeFilter]);

  const hasAnyPending = useMemo(
    () => docs.some((d) => (d.status as SellerDocumentStatus) === "pending"),
    [docs]
  );

  const hasAnyApprovedDoc = useMemo(
    () => docs.some((d) => (d.status as SellerDocumentStatus) === "approved"),
    [docs]
  );

  // ---------- SINGLE LOADER (role + docs) ----------
  async function loadAll(opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;

    try {
      if (!silent) setLoading(true);
      setPageError(null);

      // 1) Auth
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData?.user;

      if (userError || !user) {
        setAuthorized(false);
        setPageError("You must be logged in to access seller verification.");
        return;
      }

      setUserId(user.id);

      // 2) Load profile role (verification must be accessible BEFORE seller approval)
      const roleHint = getRoleHintFromUser(user);
      const nextRole = await getProfileRoleWithTimeout(supabase, user.id);
      setRole(nextRole);

      if (!nextRole && roleHint) {
        setRole(roleHint);
        void syncProfileFromAuthUser(supabase, user, roleHint).catch((profileErr) => {
          console.error("[seller/verification] profile bootstrap failed:", profileErr);
        });
      }

      // 3) Load existing seller documents (for this user)
      const { data, error } = await supabase
        .from("seller_documents")
        .select(
          "id, seller_id, document_type, file_url, status, admin_notes, created_at, reviewed_at, reviewed_by"
        )
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setPageError(error.message || "Could not load your documents.");
        return;
      }

      setDocs((data || []) as SellerDocumentRow[]);
      setAuthorized(true);
      setLastRefreshedAt(new Date().toLocaleString());
    } catch (err: any) {
      console.error(err);
      setAuthorized(false);
      setPageError("Unexpected error while loading seller verification: " + prettyError(err));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  // Initial load
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      await loadAll();
      if (!alive) return;
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh: only when NOT approved yet (keeps it calm + saves quota)
  useEffect(() => {
    if (!authorized) return;
    if (isApprovedSeller) return;

    const id = window.setInterval(() => {
      // Silent refresh (no skeleton flicker)
      loadAll({ silent: true });
    }, 15000); // 15s

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, isApprovedSeller]);

  async function handleManualRefresh() {
    setRefreshing(true);
    setUploadMessage(null);
    await loadAll({ silent: true });
    setRefreshing(false);
  }

  // ---------- UPLOAD HANDLERS ----------
  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0] ?? null;
    setFile(chosen);
    setUploadMessage(null);
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();

    if (!file) {
      setUploadMessage("Please choose a file first.");
      return;
    }

    if (!userId) {
      setPageError("You are not logged in.");
      return;
    }

    setUploading(true);
    setUploadMessage(null);
    setPageError(null);

    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `${userId}/${timestamp}-${safeName}`;

      // 1) upload to storage
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error(uploadError);
        setPageError(uploadError.message || "Could not upload file.");
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(path);

      const publicUrl = publicUrlData?.publicUrl;
      if (!publicUrl) {
        setPageError("Could not get public URL for uploaded file.");
        return;
      }

      // 2) insert row into seller_documents
      const { data: inserted, error: insertError } = await supabase
        .from("seller_documents")
        .insert({
          seller_id: userId,
          document_type: documentType,
          file_url: publicUrl,
          status: "pending",
        })
        .select(
          "id, seller_id, document_type, file_url, status, admin_notes, created_at, reviewed_at, reviewed_by"
        )
        .maybeSingle();

      if (insertError) {
        console.error(insertError);
        setPageError(insertError.message || "Could not save document record.");
        return;
      }

      if (inserted) {
        setDocs((prev) => [inserted as SellerDocumentRow, ...prev]);
        setUploadMessage("Document uploaded successfully and is pending review.");
      }

      // Reset file + UI
      setFile(null);
      setDocumentType("business_license");
      const input = document.getElementById("seller-doc-file-input") as HTMLInputElement | null;
      if (input) input.value = "";

      // Silent refresh so role/doc status stays accurate
      await loadAll({ silent: true });
    } catch (err: any) {
      console.error(err);
      setPageError("Unexpected error while uploading document: " + prettyError(err));
    } finally {
      setUploading(false);
    }
  }

  // ---------- EARLY ACCESS ERROR ----------
  if (!loading && !authorized && pageError) {
    return (
      <main className="min-h-screen px-4 py-6 md:px-10">
        <div className="bg-scene" />
        <div className="bg-vignette" />
        <div className="sparkles" />

        <div className="mx-auto max-w-4xl">
          <div className="glass glass-card glow-green rounded-[22px] glass-ring p-6 text-center mt-6">
            <div className="text-4xl mb-2">🚫</div>
            <div className="text-lg font-semibold text-slate-900 mb-1">
              Access restricted
            </div>
            <div className="text-sm text-slate-700 mb-3">{pageError}</div>
            <button
              className="pill px-4 py-2 font-semibold text-slate-900"
              onClick={() => router.push("/")}
            >
              ← Home
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ---------- MAIN UI ----------
  return (
    <main className="min-h-screen px-4 py-6 md:px-10">
      {/* background layers */}
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      <div className="mx-auto max-w-6xl">
        {/* HEADER CARD */}
        <div className="glass glass-card glow-blue rounded-[28px] glass-ring p-6 md:p-8 mt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-700">My account</div>
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-slate-900">
                Seller verification
              </h1>
              <p className="mt-2 text-sm md:text-base text-slate-700 max-w-2xl">
                Complete two quick steps: discover requirements, then apply with your document.
              </p>

              <div className="mt-4 flex md:hidden items-center gap-2">
                <a href="#discover" className="pill px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white/70 border border-white/90">
                  1. Discover
                </a>
                <a href="#apply" className="pill px-3 py-1.5 text-xs font-semibold text-slate-900 bg-emerald-300/80 border border-emerald-400/80">
                  2. Apply
                </a>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                className="pill px-4 py-2 text-xs md:text-sm font-semibold text-slate-900"
                onClick={() => router.push(isApprovedSeller ? "/seller" : "/account")}
              >
                {isApprovedSeller ? "← Back to seller dashboard" : "← Back to account"}
              </button>

              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={refreshing || uploading}
                className={[
                  "hidden md:inline-flex pill px-4 py-2 text-xs md:text-sm font-semibold",
                  refreshing
                    ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                    : "bg-white/60 text-slate-800 border border-white/80 hover:bg-white",
                ].join(" ")}
                title="Refresh status (role + documents)"
              >
                {refreshing ? "Refreshing…" : "↻ Refresh status"}
              </button>

              {lastRefreshedAt && (
                <div className="hidden md:block text-[10px] text-slate-600">
                  Last checked: <span className="font-semibold">{lastRefreshedAt}</span>
                </div>
              )}
            </div>
          </div>

          {/* STATUS BANNER (role + docs progress) */}
          {!loading && (
            <div
              className={[
                "mt-5 rounded-2xl border px-4 py-3",
                isApprovedSeller
                  ? "border-emerald-200 bg-emerald-50/80 text-emerald-900"
                  : "border-amber-200 bg-amber-50/90 text-amber-950",
              ].join(" ")}
            >
              {isApprovedSeller ? (
                <div>
                  <div className="font-semibold">✅ Seller status: Approved</div>
                  <div className="mt-0.5 text-sm opacity-90">
                    Your account is approved. You can create and submit products.
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-semibold">⚠️ Seller status: Pending approval</div>
                  <div className="mt-0.5 text-sm opacity-90">
                    Upload one valid document below. We review and update your status.
                  </div>
                  <div className="mt-2 text-[11px] text-slate-700">
                    {hasAnyPending ? "You already have a pending submission." : "No submission yet."}
                  </div>
                </div>
              )}
            </div>
          )}

          {pageError && (
            <div className="mt-4 text-sm text-red-700 bg-white/60 border border-red-200 rounded-2xl px-4 py-3 whitespace-pre-wrap">
              {pageError}
            </div>
          )}
        </div>

        {/* DISCOVER CARD */}
        <section id="discover" className="mt-6 glass glass-card rounded-[24px] glass-ring p-5 md:p-6">
          <h2 className="text-lg md:text-xl font-semibold text-slate-900">1. Discover requirements</h2>
          <p className="mt-1 text-sm text-slate-700">
            Submit one clear document that proves your business identity.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/80 border border-white px-3 py-1.5 text-xs font-semibold text-slate-800">Business license</span>
            <span className="rounded-full bg-white/80 border border-white px-3 py-1.5 text-xs font-semibold text-slate-800">Tax ID / EIN</span>
            <span className="rounded-full bg-white/80 border border-white px-3 py-1.5 text-xs font-semibold text-slate-800">Government ID</span>
          </div>
          <p className="mt-3 text-[11px] text-slate-600">
            Tip: upload a readable image or PDF to avoid rejection.
          </p>
        </section>

        {/* UPLOAD CARD */}
        <section id="apply" className="mt-6 glass glass-card glow-green rounded-[28px] glass-ring p-6 md:p-8">
          <h2 className="text-lg md:text-xl font-semibold text-slate-900">
            2. Apply to become a seller
          </h2>
          <p className="mt-1 text-sm text-slate-700">
            Choose document type, upload file, and submit.
          </p>

          <form onSubmit={handleUpload} className="mt-4">
            <div className="mt-2 grid gap-4 md:grid-cols-[1.7fr,1.3fr] items-end">
              {/* LEFT: fields */}
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Document type
                  </label>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value as typeof documentType)}
                    className="w-full rounded-full border border-white/80 bg-white/90 px-4 py-2.5 text-sm text-slate-900 outline-none"
                    disabled={uploading}
                  >
                    <option value="business_license">Business license</option>
                    <option value="tax_id">Tax ID / EIN</option>
                    <option value="id_card">Government ID</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">File</label>
                  <input
                    id="seller-doc-file-input"
                    type="file"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="block w-full text-xs text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-slate-900/90 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white file:cursor-pointer"
                  />
                </div>
              </div>

              {/* RIGHT: button */}
              <div className="flex justify-end md:justify-center">
                <button
                  type="submit"
                  disabled={uploading || !file || !userId}
                  className="btn-cta w-full md:w-auto px-8 py-3 rounded-full text-sm md:text-base font-semibold text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/40"
                >
                  {uploading ? "Submitting…" : "Submit application"}
                </button>
              </div>
            </div>
          </form>

          {uploadMessage && !pageError && (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-xs md:text-sm text-emerald-900">
              {uploadMessage}
            </div>
          )}
        </section>

        {/* FILTER TABS + LIST */}
        <div className="mt-6 glass glass-card rounded-[24px] glass-ring p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm md:text-base font-semibold text-slate-900">
              Your verification documents
            </h2>
            <div className="flex flex-wrap gap-2">
              {filterTabs.map((tab) => {
                const isActive = activeFilter === tab.key;
                const count =
                  tab.key === "all"
                    ? counts.all
                    : counts[tab.key as SellerDocumentStatus];
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveFilter(tab.key)}
                    type="button"
                    className={[
                      "pill px-3 py-1.5 text-[11px] md:text-xs font-semibold",
                      isActive
                        ? "bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/40"
                        : "bg-white/60 text-slate-800 border border-white/80",
                    ].join(" ")}
                  >
                    {tab.label}{" "}
                    <span className="text-[10px] opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-slate-700">Loading your documents…</div>
          ) : filteredDocs.length === 0 ? (
            <div className="rounded-2xl bg-white/70 border border-white/80 px-4 py-6 text-sm text-slate-700">
              You haven&apos;t uploaded any verification documents yet. Use the form above to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDocs.map((d) => {
                const status = (d.status as SellerDocumentStatus) || "pending";

                let badgeClass = "bg-slate-900/85 text-white shadow-slate-900/40";
                if (status === "approved") {
                  badgeClass = "bg-emerald-500/90 text-white shadow-emerald-500/40";
                } else if (status === "rejected") {
                  badgeClass = "bg-rose-500/90 text-white shadow-rose-500/40";
                } else if (status === "pending") {
                  badgeClass = "bg-amber-400/90 text-slate-900 shadow-amber-400/40";
                }

                return (
                  <div
                    key={d.id}
                    className="flex flex-col gap-3 rounded-2xl bg-white/75 border border-white/80 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          {humanDocumentType(d.document_type)}
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide shadow-md ${badgeClass}`}
                        >
                          {labelStatus(status)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 mt-1">
                        Uploaded: {new Date(d.created_at).toLocaleString()}
                      </div>
                      {d.admin_notes && (
                        <div className="mt-1 text-[11px] text-slate-700">
                          Admin notes:{" "}
                          <span className="font-medium">{d.admin_notes}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 md:flex-col md:items-end">
                      <a
                        href={d.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full bg-slate-900/90 px-4 py-1.5 text-[11px] font-semibold text-white shadow-md shadow-slate-900/40"
                      >
                        View file
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
