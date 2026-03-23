// app/admin/approvals/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Check, X, DollarSign, Users } from "lucide-react";

type ProductStatus = "draft" | "submitted" | "approved" | "rejected" | "archived";

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  image_url: string | null;
  status: ProductStatus;
  price_cents: number | null;
  final_price_cents: number | null;
  public_employee_price_cents: number | null;
  created_at: string;
  seller_id: string;
  categories?: { name: string } | { name: string }[] | null;
};

type SellerProfile = {
  id: string;
  role: string | null;
};

type SellerSummary = {
  seller_id: string;
  role: string | null;
  submittedCount: number;
  lastSubmittedAt: string;
};

function money(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return "";
  return `$${(cents / 100).toFixed(2)}`;
}

function toCents(input: string) {
  const cleaned = input.trim().replace(/[$,]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function categoryName(raw: ProductRow["categories"]) {
  if (!raw) return "General";
  if (Array.isArray(raw)) return raw?.[0]?.name ?? "General";
  return raw?.name ?? "General";
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminApprovalsPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [submittedProducts, setSubmittedProducts] = useState<ProductRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, SellerProfile>>({});

  const [selectedSellerId, setSelectedSellerId] = useState<string | "all">("all");

  const [finalPriceInputs, setFinalPriceInputs] = useState<Record<string, string>>({});
  const [pePriceInputs, setPePriceInputs] = useState<Record<string, string>>({});
  const [actingOn, setActingOn] = useState<string | null>(null);

  // Admin auth check
  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user;

        if (!user) {
          router.replace("/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (error || data?.role !== "admin") {
          router.replace("/");
          return;
        }

        if (alive) setIsAdmin(true);
      } finally {
        if (alive) setChecking(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [router]);

  // Load submitted products + seller list
  useEffect(() => {
    if (!isAdmin) return;

    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setPageError(null);

        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select(`
            id,
            name,
            description,
            emoji,
            image_url,
            status,
            price_cents,
            final_price_cents,
            public_employee_price_cents,
            created_at,
            seller_id,
            categories(name)
          `)
          .eq("status", "submitted")
          .order("created_at", { ascending: false });

        if (!alive) return;
        if (prodErr) throw prodErr;

        const products = (prodData ?? []) as ProductRow[];
        setSubmittedProducts(products);

        const fp: Record<string, string> = {};
        const pep: Record<string, string> = {};
        for (const p of products) {
          fp[p.id] =
            p.final_price_cents && p.final_price_cents > 0
              ? (p.final_price_cents / 100).toFixed(2)
              : "";
          pep[p.id] =
            p.public_employee_price_cents && p.public_employee_price_cents > 0
              ? (p.public_employee_price_cents / 100).toFixed(2)
              : "";
        }
        setFinalPriceInputs(fp);
        setPePriceInputs(pep);

        const sellerIds = Array.from(new Set(products.map((p) => p.seller_id))).filter(Boolean);

        if (sellerIds.length === 0) {
          setProfilesById({});
          return;
        }

        const { data: profData, error: profErr } = await supabase
          .from("profiles")
          .select("id,role")
          .in("id", sellerIds);

        if (!alive) return;
        if (profErr) throw profErr;

        const map: Record<string, SellerProfile> = {};
        for (const row of (profData ?? []) as SellerProfile[]) {
          map[row.id] = row;
        }
        setProfilesById(map);
      } catch (e: any) {
        console.error("[admin approvals] load error:", e);
        if (!alive) return;
        setPageError(e?.message ?? "Could not load submitted products.");
        setSubmittedProducts([]);
        setProfilesById({});
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  // Seller summary list
  const sellerSummaries: SellerSummary[] = useMemo(() => {
    const bySeller: Record<string, SellerSummary> = {};

    for (const p of submittedProducts) {
      const sid = p.seller_id;
      if (!sid) continue;

      const role = profilesById[sid]?.role ?? null;

      if (!bySeller[sid]) {
        bySeller[sid] = {
          seller_id: sid,
          role,
          submittedCount: 1,
          lastSubmittedAt: p.created_at,
        };
      } else {
        bySeller[sid].submittedCount += 1;
        if (new Date(p.created_at).getTime() > new Date(bySeller[sid].lastSubmittedAt).getTime()) {
          bySeller[sid].lastSubmittedAt = p.created_at;
        }
      }
    }

    return Object.values(bySeller).sort(
      (a, b) => new Date(b.lastSubmittedAt).getTime() - new Date(a.lastSubmittedAt).getTime()
    );
  }, [submittedProducts, profilesById]);

  const filteredProducts = useMemo(() => {
    if (selectedSellerId === "all") return submittedProducts;
    return submittedProducts.filter((p) => p.seller_id === selectedSellerId);
  }, [submittedProducts, selectedSellerId]);

  // Auto-reset filter when empty
  useEffect(() => {
    if (selectedSellerId !== "all" && filteredProducts.length === 0 && !loading) {
      setSelectedSellerId("all");
    }
  }, [filteredProducts.length, selectedSellerId, loading]);

  async function approveProduct(p: ProductRow) {
    setPageError(null);

    const fp = toCents(finalPriceInputs[p.id] ?? "");
    if (!fp || fp <= 0) {
      setPageError("Final price is required to approve a product.");
      return;
    }

    const pep = toCents(pePriceInputs[p.id] ?? "");

    try {
      setActingOn(p.id);

      const { error } = await supabase
        .from("products")
        .update({
          status: "approved",
          final_price_cents: fp,
          public_employee_price_cents: pep,
        })
        .eq("id", p.id);

      if (error) {
        console.error(error);
        setPageError(error.message || "Failed to approve product.");
        return;
      }

      setSubmittedProducts((prev) => prev.filter((x) => x.id !== p.id));
      setFinalPriceInputs((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      setPePriceInputs((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
    } finally {
      setActingOn(null);
    }
  }

  async function rejectProduct(p: ProductRow) {
    const ok = window.confirm("Reject this product? (Seller can edit and resubmit.)");
    if (!ok) return;

    setPageError(null);

    try {
      setActingOn(p.id);

      const { error } = await supabase
        .from("products")
        .update({ status: "rejected" })
        .eq("id", p.id);

      if (error) {
        console.error(error);
        setPageError(error.message || "Failed to reject product.");
        return;
      }

      setSubmittedProducts((prev) => prev.filter((x) => x.id !== p.id));
      setFinalPriceInputs((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      setPePriceInputs((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
    } finally {
      setActingOn(null);
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen px-4 py-8">
        <div className="bg-scene" />
        <div className="bg-vignette" />
        <div className="sparkles" />
        <div className="mx-auto max-w-6xl glass glass-ring rounded-[28px] p-6 flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
          <span className="text-sm text-slate-600">Checking admin access…</span>
        </div>
      </main>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="min-h-screen px-4 py-6 md:px-6 md:py-8">
      <div className="bg-scene" />
      <div className="bg-vignette" />
      <div className="sparkles" />

      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="glass glass-ring rounded-[28px] p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                Admin
              </div>
              <div className="text-2xl md:text-3xl font-bold text-slate-900">
                Product Approvals
              </div>
              <div className="text-sm text-slate-700 mt-1">
                Review submitted products, set final pricing, and approve listings.
              </div>
            </div>

            <button
              onClick={() => router.push("/admin")}
              className="pill px-4 py-2 text-xs font-semibold text-slate-900"
            >
              ← Back to Admin
            </button>
          </div>

          {pageError && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/80 px-4 py-3 text-sm text-red-700">
              {pageError}
            </div>
          )}
        </div>

        {/* Layout: Sellers panel + Product list */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          {/* Left: Sellers who submitted */}
          <section className="glass glass-ring rounded-[28px] p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Sellers</div>
                <div className="text-[11px] text-slate-600">Click to filter</div>
              </div>

              <button
                onClick={() => setSelectedSellerId("all")}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  selectedSellerId === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-white/70 border border-white/80 text-slate-800"
                }`}
              >
                All
              </button>
            </div>

            {loading ? (
              <div className="rounded-2xl bg-white/70 px-4 py-5 text-sm text-slate-600 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading…
              </div>
            ) : sellerSummaries.length === 0 ? (
              <div className="rounded-2xl bg-white/70 px-4 py-5 text-sm text-slate-600">
                No pending submissions
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {sellerSummaries.map((s) => {
                  const role = (s.role ?? "").toLowerCase();
                  const isSellerRole = role === "seller";
                  const isActive = selectedSellerId === s.seller_id;

                  return (
                    <button
                      key={s.seller_id}
                      onClick={() => setSelectedSellerId(s.seller_id)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 transition ${
                        isActive
                          ? "bg-slate-900 text-white"
                          : "bg-white/70 border border-white/80 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">
                            {s.seller_id.slice(0, 12)}…
                          </div>
                          <div className={`text-[10px] ${isActive ? "text-white/70" : "text-slate-500"}`}>
                            {s.submittedCount} product{s.submittedCount !== 1 ? "s" : ""}
                          </div>
                        </div>

                        {!isSellerRole && (
                          <div
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                              isActive ? "bg-amber-400/20 text-amber-200" : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            !
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Right: Submitted products */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div className="text-sm font-semibold text-slate-900">
                {filteredProducts.length} pending
              </div>
              {selectedSellerId !== "all" && (
                <button
                  onClick={() => setSelectedSellerId("all")}
                  className="text-[11px] text-slate-600 hover:text-slate-900"
                >
                  Clear filter
                </button>
              )}
            </div>

            {loading ? (
              <div className="glass glass-ring rounded-[28px] p-8 flex items-center justify-center gap-2 text-slate-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading products…
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="glass glass-ring rounded-[28px] p-10 text-center">
                <div className="text-4xl mb-3">📦</div>
                <div className="text-sm font-semibold text-slate-900">No products to review</div>
                <div className="text-xs text-slate-600 mt-1">
                  {selectedSellerId === "all" 
                    ? "All caught up! Check back later for new submissions."
                    : "This seller has no pending products."}
                </div>
              </div>
            ) : (
              filteredProducts.map((p) => {
                const sellerRole = (profilesById[p.seller_id]?.role ?? "").toLowerCase();
                const isSellerRole = sellerRole === "seller";
                const isWorking = actingOn === p.id;

                return (
                  <div
                    key={p.id}
                    className="glass glass-ring rounded-[24px] p-4 md:p-5"
                  >
                    {/* Product Header */}
                    <div className="flex gap-4 mb-4">
                      <div className="h-20 w-20 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-3xl overflow-hidden shrink-0">
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span>{p.emoji ?? "📦"}</span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[11px] font-medium text-emerald-700 uppercase tracking-wide">
                              {categoryName(p.categories)}
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 leading-tight">
                              {p.name}
                            </h3>
                          </div>
                          {!isSellerRole && (
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">
                              Not seller
                            </span>
                          )}
                        </div>

                        {p.description && (
                          <p className="mt-1 text-sm text-slate-600 line-clamp-2">
                            {p.description}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span>Seller: {p.seller_id.slice(0, 8)}…</span>
                          <span>•</span>
                          <span>{formatDate(p.created_at)}</span>
                          <span>•</span>
                          <span className="font-medium text-slate-700">
                            Asking: {p.price_cents != null ? money(p.price_cents) : "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pricing & Actions */}
                    <div className="border-t border-slate-200/60 pt-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div>
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                            <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                            Final Price <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={finalPriceInputs[p.id] ?? ""}
                              onChange={(e) =>
                                setFinalPriceInputs((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              placeholder="0.00"
                              disabled={isWorking}
                              className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 disabled:bg-slate-100 disabled:text-slate-500 transition"
                            />
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500">Customer price on /shop</p>
                        </div>

                        <div>
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5">
                            <Users className="w-3.5 h-3.5 text-blue-600" />
                            Employee Price
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={pePriceInputs[p.id] ?? ""}
                              onChange={(e) =>
                                setPePriceInputs((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              placeholder="0.00"
                              disabled={isWorking}
                              className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 disabled:bg-slate-100 disabled:text-slate-500 transition"
                            />
                          </div>
                          <p className="mt-1 text-[10px] text-slate-500">Optional special price</p>
                        </div>
                      </div>

                      {/* Action Buttons - Now full width and prominent */}
                      <div className="flex gap-3">
                        <button
                          disabled={isWorking}
                          onClick={() => rejectProduct(p)}
                          className="flex-1 rounded-xl bg-white border-2 border-rose-200 text-rose-700 px-4 py-3 text-sm font-bold hover:bg-rose-50 hover:border-rose-300 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                        >
                          {isWorking ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
                          )}
                          Reject
                        </button>

                        <button
                          disabled={isWorking}
                          onClick={() => approveProduct(p)}
                          className="flex-1 rounded-xl bg-emerald-500 text-white px-4 py-3 text-sm font-bold hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25"
                        >
                          {isWorking ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </div>
      </div>
    </main>
  );
}