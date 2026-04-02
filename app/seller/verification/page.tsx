"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getProfileAccessStateWithTimeout,
  type AppRole,
  type SellerStatus,
} from "@/lib/authProfile";

type SellerDocumentStatus = "pending" | "approved" | "rejected";
type DocumentType = "business_license" | "tax_id" | "id_card";
type FilterKey = "all" | SellerDocumentStatus;
type PageMode = "approved" | "pending" | "rejected" | "not_started";

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

type MaybeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  error_description?: string;
};

const STORAGE_BUCKET = "seller_documents";

function normalizeDocumentStatus(value: unknown): SellerDocumentStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();

  if (
    normalized === "pending" ||
    normalized === "approved" ||
    normalized === "rejected"
  ) {
    return normalized;
  }

  return null;
}

function humanDocumentType(docType: string) {
  return docType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function labelStatus(status: SellerDocumentStatus | string) {
  if (status === "pending") return "Pending review";
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return status || "Unknown";
}

function prettyError(error: unknown) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;

  const maybeError = error as MaybeError;
  if (maybeError.message) return maybeError.message;
  if (maybeError.error_description) return maybeError.error_description;
  if (maybeError.details) return maybeError.details;
  if (maybeError.hint) return maybeError.hint;

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function businessNameForUser(user: User) {
  const raw =
    user.user_metadata?.business_name ||
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.email ||
    "Seller";

  return String(raw).trim() || "Seller";
}

function derivePageMode(
  role: AppRole,
  sellerStatus: SellerStatus,
  docs: SellerDocumentRow[]
): PageMode {
  if (role === "seller" || sellerStatus === "approved") return "approved";
  if (sellerStatus === "rejected") return "rejected";

  const hasDocuments = docs.length > 0;
  const hasPendingDocs = docs.some(
    (doc) => normalizeDocumentStatus(doc.status) === "pending"
  );

  if (sellerStatus === "pending" || hasPendingDocs || hasDocuments) {
    return "pending";
  }

  return "not_started";
}

async function ensureSellerApplicationForSubmission(
  user: User,
  sellerStatus: SellerStatus
) {
  if (sellerStatus === "approved") return;

  const businessName = businessNameForUser(user);
  const now = new Date().toISOString();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      seller_status: "pending",
      business_name: businessName,
      updated_at: now,
    })
    .eq("id", user.id);

  if (profileError) {
    throw profileError;
  }

  const { data: existingApplication, error: existingApplicationError } =
    await supabase
      .from("seller_applications")
      .select("id")
      .eq("user_id", user.id)
      .order("applied_at", { ascending: false })
      .limit(1)
      .maybeSingle();

  if (
    existingApplicationError &&
    existingApplicationError.code !== "PGRST116"
  ) {
    throw existingApplicationError;
  }

  if (existingApplication?.id) {
    const { error: updateApplicationError } = await supabase
      .from("seller_applications")
      .update({
        business_name: businessName,
        status: "pending",
        applied_at: now,
      })
      .eq("id", existingApplication.id);

    if (updateApplicationError) {
      throw updateApplicationError;
    }
  } else {
    const { error: insertApplicationError } = await supabase
      .from("seller_applications")
      .insert({
        user_id: user.id,
        business_name: businessName,
        status: "pending",
        applied_at: now,
      });

    if (insertApplicationError) {
      throw insertApplicationError;
    }
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      role: "seller",
      business_name: businessName,
    },
  });

  if (metadataError) {
    throw metadataError;
  }
}

export default function SellerVerificationPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<AppRole>(null);
  const [sellerStatus, setSellerStatus] = useState<SellerStatus>(null);

  const [docs, setDocs] = useState<SellerDocumentRow[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const [documentType, setDocumentType] =
    useState<DocumentType>("business_license");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const pageMode = useMemo(
    () => derivePageMode(userRole, sellerStatus, docs),
    [docs, sellerStatus, userRole]
  );

  const isApprovedSeller = pageMode === "approved";

  const counts = useMemo(
    () => ({
      all: docs.length,
      pending: docs.filter(
        (doc) => normalizeDocumentStatus(doc.status) === "pending"
      ).length,
      approved: docs.filter(
        (doc) => normalizeDocumentStatus(doc.status) === "approved"
      ).length,
      rejected: docs.filter(
        (doc) => normalizeDocumentStatus(doc.status) === "rejected"
      ).length,
    }),
    [docs]
  );

  const filteredDocs = useMemo(() => {
    if (activeFilter === "all") return docs;
    return docs.filter(
      (doc) => normalizeDocumentStatus(doc.status) === activeFilter
    );
  }, [activeFilter, docs]);

  const loadPage = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;

    try {
      if (!silent) setLoading(true);
      setPageError(null);

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setAuthorized(false);
        setUserId(null);
        setUserRole(null);
        setSellerStatus(null);
        setDocs([]);
        setPageError("You must be logged in to access seller verification.");
        return;
      }

      setUserId(user.id);

      const accessState = await getProfileAccessStateWithTimeout(
        supabase,
        user.id
      );

      setUserRole(accessState.role);
      setSellerStatus(accessState.sellerStatus);

      const { data: documents, error: documentError } = await supabase
        .from("seller_documents")
        .select(
          "id, seller_id, document_type, file_url, status, admin_notes, created_at, reviewed_at, reviewed_by"
        )
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });

      if (documentError) {
        throw documentError;
      }

      setDocs((documents ?? []) as SellerDocumentRow[]);
      setAuthorized(true);
      setLastRefreshedAt(new Date().toLocaleString());
    } catch (error: unknown) {
      console.error("[seller/verification] load failed:", error);
      setAuthorized(false);
      setPageError(prettyError(error));
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  async function handleManualRefresh() {
    setRefreshing(true);
    setUploadMessage(null);
    await loadPage({ silent: true });
    setRefreshing(false);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setUploadMessage(null);
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();

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
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw authError ?? new Error("You must be logged in.");
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${user.id}/${timestamp}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      const publicUrl = publicUrlData.publicUrl;
      if (!publicUrl) {
        throw new Error("Could not create a public URL for the uploaded file.");
      }

      const { error: documentInsertError } = await supabase
        .from("seller_documents")
        .insert({
          seller_id: user.id,
          document_type: documentType,
          file_url: publicUrl,
          status: "pending",
        });

      if (documentInsertError) {
        throw documentInsertError;
      }

      await ensureSellerApplicationForSubmission(user, sellerStatus);

      setDocumentType("business_license");
      setFile(null);

      const input = document.getElementById(
        "seller-doc-file-input"
      ) as HTMLInputElement | null;

      if (input) {
        input.value = "";
      }

      setUploadMessage("Document uploaded and submitted for review.");
      await loadPage({ silent: true });
    } catch (error: unknown) {
      console.error("[seller/verification] upload failed:", error);
      setPageError(prettyError(error));
    } finally {
      setUploading(false);
    }
  }

  if (!loading && !authorized && pageError) {
    return (
      <main className="min-h-screen px-4 py-6 md:px-10">
        <div className="bg-scene" />
        <div className="bg-vignette" />
        <div className="sparkles" />

        <div className="mx-auto mt-8 max-w-3xl">
          <div className="glass glass-card glow-green rounded-[24px] glass-ring p-6 text-center">
            <div className="text-4xl">Access restricted</div>
            <p className="mt-3 text-sm text-slate-700">{pageError}</p>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="pill mt-5 px-4 py-2 text-sm font-semibold text-slate-900"
            >
              Back to home
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-10">
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      <div className="mx-auto max-w-5xl space-y-6">
        <section className="glass glass-card glow-blue rounded-[28px] glass-ring p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-700">
                My account
              </div>
              <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">
                Seller verification
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-700 md:text-base">
                Check your seller status and upload verification documents only
                when you need to apply or resubmit.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  router.push(isApprovedSeller ? "/seller" : "/account")
                }
                className="pill px-4 py-2 text-sm font-semibold text-slate-900"
              >
                {isApprovedSeller
                  ? "Back to seller dashboard"
                  : "Back to account"}
              </button>

              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={refreshing || uploading}
                className={[
                  "pill px-4 py-2 text-sm font-semibold",
                  refreshing
                    ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                    : "bg-white/70 text-slate-900 border border-white/80",
                ].join(" ")}
              >
                {refreshing ? "Refreshing..." : "Refresh status"}
              </button>
            </div>
          </div>

          <div
            className={[
              "mt-5 rounded-2xl border px-4 py-4",
              pageMode === "approved"
                ? "border-emerald-200 bg-emerald-50/85 text-emerald-950"
                : pageMode === "rejected"
                  ? "border-rose-200 bg-rose-50/90 text-rose-950"
                  : "border-amber-200 bg-amber-50/90 text-amber-950",
            ].join(" ")}
          >
            {pageMode === "approved" && (
              <>
                <div className="font-semibold">Seller status: Approved</div>
                <div className="mt-1 text-sm opacity-90">
                  Your seller access is active. This page will not reset your
                  approval status.
                </div>
              </>
            )}

            {pageMode === "pending" && (
              <>
                <div className="font-semibold">Seller status: Pending review</div>
                <div className="mt-1 text-sm opacity-90">
                  Your submission is waiting for admin review. You can refresh
                  this page to check for changes.
                </div>
              </>
            )}

            {pageMode === "rejected" && (
              <>
                <div className="font-semibold">Seller status: Rejected</div>
                <div className="mt-1 text-sm opacity-90">
                  You can upload a new document below to resubmit for review.
                </div>
              </>
            )}

            {pageMode === "not_started" && (
              <>
                <div className="font-semibold">Seller status: Not submitted</div>
                <div className="mt-1 text-sm opacity-90">
                  Upload one business document to start your seller review.
                </div>
              </>
            )}

            {lastRefreshedAt && (
              <div className="mt-3 text-xs opacity-70">
                Last checked: {lastRefreshedAt}
              </div>
            )}
          </div>

          {pageError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-white/70 px-4 py-3 text-sm text-red-700">
              {pageError}
            </div>
          )}
        </section>

        {!isApprovedSeller && (
          <section className="glass glass-card glow-green rounded-[28px] glass-ring p-6 md:p-8">
            <h2 className="text-lg font-semibold text-slate-900 md:text-xl">
              Submit verification
            </h2>
            <p className="mt-1 text-sm text-slate-700">
              Upload a business license, tax ID, or government ID. Your seller
              status will only move to pending when you explicitly submit a
              document.
            </p>

            <form onSubmit={handleUpload} className="mt-5 grid gap-4 md:grid-cols-[1.6fr,1.4fr]">
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Document type
                  </label>
                  <select
                    value={documentType}
                    onChange={(event) =>
                      setDocumentType(event.target.value as DocumentType)
                    }
                    disabled={uploading}
                    className="w-full rounded-2xl border border-white/80 bg-white/90 px-4 py-3 text-sm text-slate-900 outline-none"
                  >
                    <option value="business_license">Business license</option>
                    <option value="tax_id">Tax ID / EIN</option>
                    <option value="id_card">Government ID</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    File
                  </label>
                  <input
                    id="seller-doc-file-input"
                    type="file"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="block w-full text-xs text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white"
                  />
                </div>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={uploading || !file || !userId}
                  className="btn-cta w-full rounded-full px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? "Submitting..." : "Submit for review"}
                </button>
              </div>
            </form>

            {uploadMessage && !pageError && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900">
                {uploadMessage}
              </div>
            )}
          </section>
        )}

        <section className="glass glass-card rounded-[24px] glass-ring p-5 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900 md:text-lg">
              Verification documents
            </h2>

            <div className="flex flex-wrap gap-2">
              {(["pending", "approved", "rejected", "all"] as FilterKey[]).map(
                (key) => {
                  const count =
                    key === "all"
                      ? counts.all
                      : counts[key as SellerDocumentStatus];

                  const isActive = activeFilter === key;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveFilter(key)}
                      className={[
                        "pill px-3 py-1.5 text-xs font-semibold",
                        isActive
                          ? "bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/40"
                          : "bg-white/70 text-slate-900 border border-white/80",
                      ].join(" ")}
                    >
                      {key === "all"
                        ? "All"
                        : key.charAt(0).toUpperCase() + key.slice(1)}{" "}
                      <span className="opacity-75">({count})</span>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-slate-700">Loading documents...</div>
          ) : filteredDocs.length === 0 ? (
            <div className="rounded-2xl border border-white/80 bg-white/70 px-4 py-6 text-sm text-slate-700">
              No verification documents found yet.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDocs.map((doc) => {
                const status = normalizeDocumentStatus(doc.status) ?? "pending";

                let badgeClass = "bg-amber-400/90 text-slate-900";
                if (status === "approved") {
                  badgeClass = "bg-emerald-500/90 text-white";
                } else if (status === "rejected") {
                  badgeClass = "bg-rose-500/90 text-white";
                }

                return (
                  <div
                    key={doc.id}
                    className="flex flex-col gap-3 rounded-2xl border border-white/80 bg-white/75 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-900">
                          {humanDocumentType(doc.document_type)}
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${badgeClass}`}
                        >
                          {labelStatus(status)}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-slate-600">
                        Uploaded: {new Date(doc.created_at).toLocaleString()}
                      </div>

                      {doc.admin_notes && (
                        <div className="mt-1 text-xs text-slate-700">
                          Admin notes:{" "}
                          <span className="font-medium">{doc.admin_notes}</span>
                        </div>
                      )}
                    </div>

                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                    >
                      View file
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
