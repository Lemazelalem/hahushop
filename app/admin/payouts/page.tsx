// app/admin/payouts/page.tsx
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProductStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "archived"
  | "delisted";

type SellerRow = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
};

type ProductRow = {
  id: string;
  seller_id: string;
  name: string;
  status: ProductStatus;
  is_active: boolean | null;
};

type PayoutRow = {
  id: string;
  seller_id: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  calculated_amount_cents: number | null;
  adjusted_amount_cents: number | null;
  paid_at: string | null;
};

type PayoutHistoryItem = {
  id: string;
  amountCents: number;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
};

type SellerStats = {
  seller_id: string;
  name: string;
  contact: string;
  totalProducts: number;
  submitted: number;
  approved: number;
  delisted: number;
  totalPendingCents: number;
  totalPaidCents: number;
  totalOwedCents: number;
  payoutCount: number;
  productList: { id: string; name: string; status: string; isActive: boolean }[];
  payoutHistory: PayoutHistoryItem[];
};

function formatMoney(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "—";
  return `ETB ${(cents / 100).toFixed(2)}`;
}

function formatMoneyCompact(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "ETB 0";
  const value = cents / 100;
  if (value >= 1_000_000) return `ETB ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `ETB ${(value / 1_000).toFixed(1)}K`;
  return `ETB ${value.toFixed(0)}`;
}

// helpers to build YYYY-MM-DD
function formatDateYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatPeriod(start: string | null, end: string | null) {
  if (start && end) {
    return `${new Date(start).toLocaleDateString()} to ${new Date(end).toLocaleDateString()}`;
  }
  if (start) return `From ${new Date(start).toLocaleDateString()}`;
  if (end) return `Until ${new Date(end).toLocaleDateString()}`;
  return "No period recorded";
}

function getAmountCents(payout: PayoutRow) {
  return payout.adjusted_amount_cents ?? payout.calculated_amount_cents ?? 0;
}

export default function AdminSellerPayoutsPage() {
  const router = useRouter();
  const mountedRef = useRef(true);

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);

  // reload key to re-run the loader after recording a payout
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [expandedSellerId, setExpandedSellerId] = useState<string | null>(null);

  // modal state
  const [activeSeller, setActiveSeller] = useState<SellerStats | null>(null);
  const [modalAmount, setModalAmount] = useState<string>("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSaving, setModalSaving] = useState(false);

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ------------------------------
  // AUTH + ROLE CHECK
  // ------------------------------
  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        const { data: sess, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) {
          console.error("[admin payouts] session error:", sessionError);
          if (mountedRef.current) router.replace("/login");
          return;
        }

        const user = sess.session?.user;

        if (!user) {
          if (mountedRef.current) router.replace("/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (error) {
          console.error("[admin payouts] profile fetch error:", error);
          if (mountedRef.current) router.replace("/");
          return;
        }

        if (!data || data.role !== "admin") {
          if (mountedRef.current) router.replace("/");
          return;
        }

        if (alive && mountedRef.current) setIsAdmin(true);
      } finally {
        if (alive && mountedRef.current) setChecking(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [router]);

  // ------------------------------
  // LOAD SELLERS + PRODUCTS + PAYOUTS
  // ------------------------------
  useEffect(() => {
    if (!isAdmin) return;

    let alive = true;

    async function load() {
      if (mountedRef.current) {
        setLoading(true);
        setErrorMsg(null);
      }

      try {
        // 1) Fetch products, payouts, and seller_documents in parallel
        const [
          { data: prodData, error: prodErr },
          { data: payoutData, error: payoutErr },
          { data: sellerDocData, error: sellerDocErr },
        ] = await Promise.all([
          supabase.from("products").select("id, seller_id, name, status, is_active"),
          supabase
            .from("seller_payouts")
            .select(
              "id, seller_id, status, period_start, period_end, calculated_amount_cents, adjusted_amount_cents, paid_at"
            ),
          supabase.from("seller_documents").select("seller_id"),
        ]);

        if (!alive || !mountedRef.current) return;

        if (prodErr) console.error("[admin payouts] products query error:", prodErr);
        if (payoutErr) console.error("[admin payouts] seller_payouts query error:", payoutErr);
        if (sellerDocErr) console.error("[admin payouts] seller_documents query error:", sellerDocErr);

        // 2) Collect all unique seller IDs from multiple sources
        const sellerIdSet = new Set<string>();
        for (const p of prodData ?? []) {
          if (p.seller_id) sellerIdSet.add(p.seller_id);
        }
        for (const d of sellerDocData ?? []) {
          if (d.seller_id) sellerIdSet.add(d.seller_id);
        }
        for (const pay of payoutData ?? []) {
          if (pay.seller_id) sellerIdSet.add(pay.seller_id);
        }

        // 3) Fetch profiles via server API (bypasses RLS on profiles table)
        let sellerProfiles: SellerRow[] = [];

        // Get seller-role profiles (discovers sellers not in other tables)
        const roleRes = await fetch("/api/admin/profiles?role=seller");
        if (roleRes.ok) {
          const roleData = await roleRes.json();
          for (const p of roleData.profiles ?? []) {
            if (p.id) sellerIdSet.add(p.id);
          }
        }

        // Fetch full profiles for all discovered seller IDs
        const sellerIds = Array.from(sellerIdSet);
        if (sellerIds.length > 0) {
          const profRes = await fetch(`/api/admin/profiles?ids=${sellerIds.join(",")}`);
          if (profRes.ok) {
            const profData = await profRes.json();
            sellerProfiles = (profData.profiles ?? []) as SellerRow[];
          }
        }

        if (!alive || !mountedRef.current) return;

        if (mountedRef.current) {
          setSellers(sellerProfiles);
          setProducts((prodData ?? []) as ProductRow[]);
          setPayouts((payoutData ?? []) as PayoutRow[]);
        }

        if (prodErr || payoutErr) {
          const errors: string[] = [];
          if (prodErr) errors.push("products");
          if (payoutErr) errors.push("payouts");

          if (mountedRef.current) {
            setErrorMsg(
              `Failed to load: ${errors.join(", ")}. Check console for details.`
            );
          }
        } else if (mountedRef.current) {
          setErrorMsg(null);
        }
      } catch (e) {
        if (!alive || !mountedRef.current) return;
        console.error("[admin payouts] unexpected error:", e);
        setErrorMsg("Failed to load seller payouts.");
      } finally {
        if (alive && mountedRef.current) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [isAdmin, reloadKey]);

  // ------------------------------
  // DERIVE PER-SELLER STATS
  // ------------------------------
  const sellerStats = useMemo<SellerStats[]>(() => {
    if (!sellers.length) return [];

    const productBySeller: Record<string, ProductRow[]> = {};
    for (const p of products) {
      if (!p.seller_id) continue;
      if (!productBySeller[p.seller_id]) productBySeller[p.seller_id] = [];
      productBySeller[p.seller_id].push(p);
    }

    const payoutBySeller: Record<string, PayoutRow[]> = {};
    for (const pay of payouts) {
      if (!pay.seller_id) continue;
      if (!payoutBySeller[pay.seller_id]) payoutBySeller[pay.seller_id] = [];
      payoutBySeller[pay.seller_id].push(pay);
    }

    return sellers
      .filter((s) => s.role === "seller")
      .map((s) => {
        const nameCandidate =
          s.display_name?.trim() ||
          s.full_name?.trim() ||
          (s.phone ? s.phone.trim() : "") ||
          "Seller";

        const contact = s.phone?.trim() || "No contact";
        const prods = productBySeller[s.id] ?? [];
        const pays = payoutBySeller[s.id] ?? [];

        const totalProducts = prods.length;
        const submitted = prods.filter((p) => p.status === "submitted").length;
        const approved = prods.filter(
          (p) => p.status === "approved" && p.is_active !== false
        ).length;
        const delisted = prods.filter(
          (p) => p.status === "delisted" || p.is_active === false
        ).length;

        let pendingFromRows = 0;
        let totalPaidCents = 0;

        for (const pay of pays) {
          const amount = getAmountCents(pay);
          if (!amount || amount <= 0) continue;

          if ((pay.status || "").toLowerCase() === "paid") {
            totalPaidCents += amount;
          } else {
            pendingFromRows += amount;
          }
        }

        const totalOwedCents = pendingFromRows + totalPaidCents;
        const totalPendingCents = Math.max(pendingFromRows - totalPaidCents, 0);

        const payoutHistory = pays
          .map((pay) => ({
            id: pay.id,
            amountCents: getAmountCents(pay),
            status: (pay.status || "unknown").toLowerCase(),
            periodStart: pay.period_start,
            periodEnd: pay.period_end,
            paidAt: pay.paid_at,
          }))
          .sort((a, b) => {
            const aDate = a.paidAt || a.periodEnd || a.periodStart || "";
            const bDate = b.paidAt || b.periodEnd || b.periodStart || "";
            return bDate.localeCompare(aDate);
          });

        const productList = prods
          .map((p) => ({
            id: p.id,
            name: p.name,
            status: p.status,
            isActive: p.is_active !== false,
          }))
          .sort((a, b) => {
            const order: Record<string, number> = {
              approved: 0,
              submitted: 1,
              draft: 2,
              rejected: 3,
              delisted: 4,
              archived: 5,
            };
            return (order[a.status] ?? 6) - (order[b.status] ?? 6);
          });

        return {
          seller_id: s.id,
          name: nameCandidate,
          contact,
          totalProducts,
          submitted,
          approved,
          delisted,
          totalPendingCents,
          totalPaidCents,
          totalOwedCents,
          payoutCount: payoutHistory.length,
          productList,
          payoutHistory,
        };
      })
      .sort((a, b) => {
        if (b.totalPendingCents !== a.totalPendingCents) {
          return b.totalPendingCents - a.totalPendingCents;
        }
        return b.totalPaidCents - a.totalPaidCents;
      });
  }, [sellers, products, payouts]);

  const filteredSellerStats = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sellerStats;

    return sellerStats.filter(
      (seller) =>
        seller.name.toLowerCase().includes(query) ||
        seller.contact.toLowerCase().includes(query) ||
        seller.productList.some((product) =>
          product.name.toLowerCase().includes(query)
        )
    );
  }, [search, sellerStats]);

  const filteredTotals = useMemo(() => {
    return filteredSellerStats.reduce(
      (acc, seller) => {
        acc.pendingCents += seller.totalPendingCents;
        acc.paidCents += seller.totalPaidCents;
        acc.recordedCents += seller.totalOwedCents;
        acc.products += seller.totalProducts;
        acc.payoutRows += seller.payoutCount;
        if (seller.totalPendingCents > 0) acc.sellersWithPending += 1;
        return acc;
      },
      {
        pendingCents: 0,
        paidCents: 0,
        recordedCents: 0,
        products: 0,
        payoutRows: 0,
        sellersWithPending: 0,
      }
    );
  }, [filteredSellerStats]);

  // ------------------------------
  // MODAL: open / close / submit
  // ------------------------------
  function openRecordModal(s: SellerStats) {
    if (s.totalPendingCents <= 0) {
      // nothing left to pay; keep it silent
      return;
    }
    setActiveSeller(s);
    setModalError(null);
    setModalSaving(false);
    // prefill with remaining amount in ETB
    setModalAmount((s.totalPendingCents / 100).toFixed(2));
  }

  function closeRecordModal() {
    if (modalSaving) return;
    setActiveSeller(null);
    setModalAmount("");
    setModalError(null);
  }

  useEffect(() => {
    if (!activeSeller) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeRecordModal();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeSeller, modalSaving]);

  async function handleRecordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSeller) return;
    if (modalSaving) return;

    const trimmed = modalAmount.trim();
    const amountNumber = Number(trimmed);
    if (!trimmed || Number.isNaN(amountNumber) || amountNumber <= 0) {
      setModalError("Enter a valid amount greater than 0.");
      return;
    }

    const amountCents = Math.round(amountNumber * 100);
    if (amountCents > activeSeller.totalPendingCents) {
      // You can relax this if you want to allow over-pay
      setModalError(
        `Amount cannot exceed remaining pending balance (${formatMoney(
          activeSeller.totalPendingCents
        )}).`
      );
      return;
    }

    setModalSaving(true);
    setModalError(null);

    try {
      // Try to reuse the most recent pending payout period for this seller
      const sellerPayoutRows = payouts.filter(
        (p) =>
          p.seller_id === activeSeller.seller_id &&
          (p.status || "").toLowerCase() !== "paid"
      );

      // choose the pending row with the latest period_end, or fallback to current month
      let periodStartStr: string;
      let periodEndStr: string;

      if (sellerPayoutRows.length > 0) {
        const sorted = [...sellerPayoutRows].sort((a, b) => {
          const ae = a.period_end ?? "";
          const be = b.period_end ?? "";
          return ae.localeCompare(be);
        });
        const latest = sorted[sorted.length - 1];
        const now = new Date();
        periodStartStr =
          latest.period_start ?? formatDateYYYYMMDD(new Date(now.getFullYear(), now.getMonth(), 1));
        periodEndStr =
          latest.period_end ?? formatDateYYYYMMDD(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      } else {
        // fallback: current month
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        periodStartStr = formatDateYYYYMMDD(start);
        periodEndStr = formatDateYYYYMMDD(end);
      }

      const nowIso = new Date().toISOString();

      const { error } = await supabase.from("seller_payouts").insert([
        {
          seller_id: activeSeller.seller_id,
          period_start: periodStartStr,
          period_end: periodEndStr,
          calculated_amount_cents: amountCents,
          adjusted_amount_cents: amountCents,
          status: "paid",
          paid_at: nowIso,
        },
      ]);

      if (error) {
        console.error("[admin payouts] record payout error:", error);
        setModalError("Failed to record payout. Check console for details.");
        setModalSaving(false);
        return;
      }

      // refresh data
      if (mountedRef.current) {
        setReloadKey((k) => k + 1);
      }

      // close modal
      closeRecordModal();
    } catch (err) {
      console.error("[admin payouts] unexpected record error:", err);
      setModalError("Unexpected error while recording payout.");
      setModalSaving(false);
    }
  }

  // ------------------------------
  // LOADING / GUARD
  // ------------------------------
  if (checking) {
    return (
      <main className="min-h-screen bg-slate-50 py-6 md:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="inline-flex items-center gap-3 text-slate-600">
              <div className="w-5 h-5 border-2 border-slate-400/30 border-t-slate-600 rounded-full animate-spin" />
              <span className="text-sm font-medium">Checking admin access...</span>
            </div>
          </div>
        </div>
      </main>
    );
  }
  if (!isAdmin) {
    return null;
  }

  const totalPendingAll = filteredTotals.pendingCents;
  const totalPaidAll = filteredTotals.paidCents;

  // ------------------------------
  // MAIN UI
  // ------------------------------
  return (
    <main className="py-4 md:py-6 space-y-4">
      {/* Compact header */}
      <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Admin</div>
            <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Seller Payouts</h1>
          </div>
          <button
            onClick={() => router.push("/admin")}
            className="pill px-4 py-1.5 text-sm font-semibold text-slate-900 shrink-0"
          >
            Back to Admin
          </button>
        </div>

        {/* KPI summary cards */}
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700/80">Pending balance</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-amber-800">{formatMoney(totalPendingAll)}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {filteredTotals.sellersWithPending} seller{filteredTotals.sellersWithPending === 1 ? "" : "s"} awaiting
            </div>
          </div>
          <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/80">Total paid</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-emerald-800">{formatMoney(totalPaidAll)}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {filteredTotals.payoutRows} transaction{filteredTotals.payoutRows === 1 ? "" : "s"}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active sellers</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{filteredSellerStats.length}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">{filteredTotals.products} products</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lifetime recorded</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{formatMoneyCompact(filteredTotals.recordedCents)}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">pending + paid</div>
          </div>
        </div>

        {/* Search */}
        <div className="mt-4 relative">
          <svg className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            id="admin-payout-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or product..."
            className="w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-2 focus:ring-slate-900/5"
          />
        </div>
      </section>

      {errorMsg && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-500">
          Loading seller data...
        </div>
      ) : filteredSellerStats.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-10 text-center">
          <div className="text-lg font-bold text-slate-900">No sellers found</div>
          <div className="mt-1 text-sm text-slate-500">Try adjusting your search terms</div>
        </div>
      ) : (
        <section className="bg-white rounded-3xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {filteredSellerStats.map((s) => (
            <div key={s.seller_id}>
              {/* Collapsed row */}
              <div className="px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 hover:bg-slate-50/60 transition-colors">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-xs font-bold text-slate-500 shrink-0">
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-slate-900 text-sm truncate">{s.name}</span>
                      {s.totalPendingCents > 0 && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                          title="Payout due"
                          aria-label="Payout due"
                        />
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      <span>{s.contact}</span>
                      <span className="mx-1 text-slate-300">·</span>
                      {s.approved === 0 && s.submitted === 0 && s.delisted === 0 ? (
                        <span>No products</span>
                      ) : (
                        <>
                          {s.approved > 0 && (
                            <span className="text-emerald-600 font-medium">{s.approved} live</span>
                          )}
                          {s.submitted > 0 && (
                            <>
                              {s.approved > 0 && <span className="mx-1 text-slate-300">·</span>}
                              <span className="text-sky-600 font-medium">{s.submitted} in review</span>
                            </>
                          )}
                          {s.delisted > 0 && (
                            <>
                              {(s.approved > 0 || s.submitted > 0) && <span className="mx-1 text-slate-300">·</span>}
                              <span>{s.delisted} delisted</span>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 pl-[42px] sm:pl-0">
                  <div className="text-left sm:text-right">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 leading-none">Pending</div>
                    <div className={`text-[13px] font-bold tabular-nums mt-0.5 ${s.totalPendingCents > 0 ? "text-amber-700" : "text-slate-300"}`}>
                      {formatMoney(s.totalPendingCents)}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 leading-none">Paid</div>
                    <div className="text-[13px] font-bold tabular-nums text-emerald-700 mt-0.5">
                      {formatMoney(s.totalPaidCents)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={s.totalPendingCents <= 0}
                      onClick={() => openRecordModal(s)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                        s.totalPendingCents <= 0
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                          : "bg-slate-900 text-white hover:bg-slate-800 shadow-sm shadow-slate-900/10"
                      }`}
                    >
                      Record
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedSellerId((current) =>
                          current === s.seller_id ? null : s.seller_id
                        )
                      }
                      aria-expanded={expandedSellerId === s.seller_id}
                      aria-controls={`seller-payout-${s.seller_id}`}
                      className="text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors"
                    >
                      {expandedSellerId === s.seller_id ? "Hide" : "Details"}
                    </button>
                  </div>
                </div>
              </div>

                  {expandedSellerId === s.seller_id && (
                    <div
                      id={`seller-payout-${s.seller_id}`}
                      className="border-t border-slate-100 bg-slate-50"
                      role="region"
                      aria-label={`${s.name} payout details`}
                    >
                      <div className="p-5 md:p-6 space-y-4">
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-sm font-semibold text-slate-700">Payout History</span>
                              <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                                {s.payoutHistory.length}
                              </span>
                            </div>
                          </div>
                          <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                            {s.payoutHistory.length === 0 ? (
                              <div className="text-center py-6 text-sm text-slate-400">
                                No payout records found
                              </div>
                            ) : (
                              s.payoutHistory.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-100 hover:border-slate-200 transition-colors"
                                >
                                  <div>
                                    <div className="text-sm font-medium text-slate-900">
                                      {formatPeriod(item.periodStart, item.periodEnd)}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-0.5">
                                      {item.paidAt
                                        ? `Paid on ${new Date(item.paidAt).toLocaleDateString()}`
                                        : "Pending payment"}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span
                                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                        item.status === "paid"
                                          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                          : "bg-amber-100 text-amber-700 border border-amber-200"
                                      }`}
                                    >
                                      {item.status}
                                    </span>
                                    <span className="text-sm font-bold text-slate-900 min-w-[80px] text-right">
                                      {formatMoney(item.amountCents)}
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                              <span className="text-sm font-semibold text-slate-700">Products</span>
                              <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                                {s.productList.length}
                              </span>
                            </div>
                          </div>
                          <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                            {s.productList.length === 0 ? (
                              <div className="text-center py-6 text-sm text-slate-400">
                                No products found
                              </div>
                            ) : (
                              s.productList.map((prod) => (
                                <div
                                  key={prod.id}
                                  className="flex items-center justify-between p-3 rounded-lg bg-white border border-slate-100 hover:border-slate-200 transition-colors"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-slate-900 truncate">
                                      {prod.name}
                                    </div>
                                  </div>
                                  <span
                                    className={`ml-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 ${
                                      prod.status === "approved" && prod.isActive
                                        ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                        : prod.status === "submitted"
                                        ? "bg-sky-100 text-sky-700 border border-sky-200"
                                        : prod.status === "delisted" || !prod.isActive
                                        ? "bg-rose-100 text-rose-700 border border-rose-200"
                                        : "bg-slate-100 text-slate-600 border border-slate-200"
                                    }`}
                                  >
                                    {prod.status === "approved" && prod.isActive
                                      ? "Live"
                                      : !prod.isActive
                                      ? "Inactive"
                                      : prod.status}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
            </div>
          ))}
        </section>
      )}
      {/* MODAL */}
      {activeSeller && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity" 
            onClick={closeRecordModal}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-payout-title"
            aria-describedby="record-payout-description"
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-slate-900/20 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="relative px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Record Payout
                  </div>
                  <div id="record-payout-title" className="text-lg font-bold text-slate-900">
                    {activeSeller.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeRecordModal}
                  disabled={modalSaving}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  aria-label="Close payout dialog"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              <div id="record-payout-description" className="mb-6 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-xs text-slate-500 mb-1">Remaining pending balance</div>
                <div className="text-2xl font-bold text-slate-900">
                  {formatMoney(activeSeller.totalPendingCents)}
                </div>
              </div>

              <form onSubmit={handleRecordSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="record-payout-amount"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2"
                  >
                    Amount to Record
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <span className="text-slate-400 font-semibold">ETB</span>
                    </div>
                    <input
                      id="record-payout-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={modalAmount}
                      onChange={(e) => setModalAmount(e.target.value)}
                      className="w-full pl-14 pr-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-900 font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      Max: {formatMoney(activeSeller.totalPendingCents)}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 underline decoration-emerald-300 hover:decoration-emerald-500 underline-offset-2 transition-all"
                      onClick={() =>
                        setModalAmount(
                          (activeSeller.totalPendingCents / 100).toFixed(2)
                        )
                      }
                    >
                      Pay full amount
                    </button>
                  </div>
                </div>

                {modalError && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-100">
                    <svg className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs text-rose-700">{modalError}</span>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeRecordModal}
                    disabled={modalSaving}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalSaving}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-900/20 hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {modalSaving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Save Payout
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

