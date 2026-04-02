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

type SellerStats = {
  seller_id: string;
  name: string;
  contact: string;
  totalProducts: number;
  submitted: number;
  approved: number;
  delisted: number;
  totalPendingCents: number; // remaining balance
  totalPaidCents: number; // sum of paid rows
  totalOwedCents: number; // all payouts ever recorded (pending + paid)
  productList: { id: string; name: string; status: string; isActive: boolean }[];
};

function formatMoney(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "—";
  return `ETB ${(cents / 100).toFixed(2)}`;
}

// helpers to build YYYY-MM-DD
function formatDateYYYYMMDD(d: Date): string {
  return d.toISOString().slice(0, 10);
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

      const contact = s.phone?.trim() || "";

      const prods = productBySeller[s.id] ?? [];
      const pays = payoutBySeller[s.id] ?? [];

      const totalProducts = prods.length;
      const submitted = prods.filter((p) => p.status === "submitted").length;
      const approved = prods.filter((p) => p.status === "approved").length;
      const delisted = prods.filter(
        (p) => p.status === "delisted" || p.is_active === false
      ).length;

      // payout math
      let pendingFromRows = 0; // sum of non-paid payout rows (accruals)
      let totalPaidCents = 0; // sum of paid rows

      for (const pay of pays) {
        const amount =
          pay.adjusted_amount_cents ?? pay.calculated_amount_cents ?? 0;
        if (!amount || amount <= 0) continue;

        const status = (pay.status || "").toLowerCase();
        if (status === "paid") {
          totalPaidCents += amount;
        } else {
          pendingFromRows += amount;
        }
      }

      // "payout record" (lifetime total) = all accruals + all payments
      const totalOwedCents = pendingFromRows + totalPaidCents;

      // remaining balance = accruals - payments, never below 0
      const totalPendingCents = Math.max(pendingFromRows - totalPaidCents, 0);

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
        productList: prods.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          isActive: p.is_active !== false,
        })),
      };
    });
  }, [sellers, products, payouts]);

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
      <main className="py-4 md:py-6">
        <div className="glass glass-ring rounded-[28px] p-6 text-sm text-slate-700">
          Checking admin access…
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const totalPendingAll = sellerStats.reduce(
    (acc, s) => acc + s.totalPendingCents,
    0
  );
  const totalPaidAll = sellerStats.reduce(
    (acc, s) => acc + s.totalPaidCents,
    0
  );

  // ------------------------------
  // MAIN UI
  // ------------------------------
  return (
    <main className="py-4 md:py-6 space-y-6">
      {/* HEADER CARD */}
      <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
              Admin
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mt-1">
              Seller Payouts
            </h1>
            <p className="text-sm md:text-base text-slate-700 mt-1">
              See each seller&apos;s products and payout totals (pending vs
              paid).
            </p>
          </div>

          <button
            onClick={() => router.push("/admin")}
            className="pill px-5 py-2 text-sm font-semibold text-slate-900"
          >
            ← Back to Admin
          </button>
        </div>

        {/* High-level stats */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass glass-ring rounded-[24px] p-4">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Sellers
            </div>
            <div className="mt-1 text-3xl font-bold text-slate-900">
              {sellerStats.length}
            </div>
            <div className="mt-1 text-[11px] text-slate-600">
              Sellers with products / payouts
            </div>
          </div>

          <div className="glass glass-ring rounded-[24px] p-4">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Pending Payouts
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-bold text-amber-900">
              {formatMoney(totalPendingAll)}
            </div>
            <div className="mt-1 text-[11px] text-amber-700">
              Total amount still to be sent
            </div>
          </div>

          <div className="glass glass-ring rounded-[24px] p-4">
            <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Paid to Sellers
            </div>
            <div className="mt-1 text-2xl md:text-3xl font-bold text-emerald-900">
              {formatMoney(totalPaidAll)}
            </div>
            <div className="mt-1 text-[11px] text-emerald-700">
              Sum of all completed payouts
            </div>
          </div>
        </div>
      </section>

      {/* ERROR (soft warning) */}
      {errorMsg && (
        <section className="glass glass-ring rounded-[28px] p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200">
          {errorMsg}
        </section>
      )}

      {/* SELLER LIST */}
      <section className="glass glass-ring rounded-[28px] p-4 md:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <div className="text-sm font-bold text-slate-900">
              Sellers &amp; Earnings
            </div>
            <div className="text-[11px] text-slate-600">
              Products they submitted, and payout amounts.
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-slate-700">Loading seller payouts…</div>
        ) : sellerStats.length === 0 ? (
          <div className="rounded-2xl bg-white/70 border border-white/80 px-4 py-8 text-center text-sm text-slate-600">
            No sellers found yet.
          </div>
        ) : (
          <div className="space-y-3">
            {sellerStats.map((s) => (
              <div
                key={s.seller_id}
                className="glass glass-ring rounded-[24px] p-4"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">
                    {s.name}
                  </div>
                  {s.contact && (
                    <div className="text-xs text-slate-600 truncate">
                      {s.contact}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-700">
                    <span>
                      Total products:{" "}
                      <b className="text-slate-900">{s.totalProducts}</b>
                    </span>
                    <span>
                      Submitted:{" "}
                      <b className="text-slate-900">{s.submitted}</b>
                    </span>
                    <span>
                      Approved:{" "}
                      <b className="text-slate-900">{s.approved}</b>
                    </span>
                    <span>
                      Delisted:{" "}
                      <b className="text-slate-900">{s.delisted}</b>
                    </span>
                  </div>
                </div>

                <div className="w-full md:w-[280px]">
                  <div className="rounded-2xl bg-white/80 border border-white/90 p-3 text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Total recorded</span>
                      <span className="font-bold text-slate-900">
                        {formatMoney(s.totalOwedCents)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Pending payout</span>
                      <span className="font-bold text-amber-900">
                        {formatMoney(s.totalPendingCents)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Paid to date</span>
                      <span className="font-bold text-emerald-900">
                        {formatMoney(s.totalPaidCents)}
                      </span>
                    </div>

                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        disabled={s.totalPendingCents <= 0}
                        onClick={() => openRecordModal(s)}
                        className={
                          "px-3 py-2 rounded-xl text-[11px] font-semibold " +
                          (s.totalPendingCents <= 0
                            ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                            : "bg-slate-900 text-white hover:bg-slate-800")
                        }
                      >
                        Record payout
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Product list */}
              {s.productList.length > 0 && (
                <div className="mt-3 rounded-2xl bg-white/60 border border-white/80 p-3">
                  <div className="text-[11px] font-bold text-slate-700 mb-2">Products ({s.productList.length})</div>
                  <div className="flex flex-wrap gap-2">
                    {s.productList.map((prod) => (
                      <span
                        key={prod.id}
                        className={[
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                          prod.status === "approved" && prod.isActive ? "bg-emerald-50 text-emerald-700" :
                          prod.status === "submitted" ? "bg-sky-50 text-sky-700" :
                          prod.status === "delisted" || !prod.isActive ? "bg-rose-50 text-rose-600" :
                          "bg-slate-100 text-slate-600"
                        ].join(" ")}
                      >
                        {prod.name}
                        <span className="text-[9px] opacity-70 uppercase">{prod.status === "approved" && prod.isActive ? "live" : !prod.isActive ? "inactive" : prod.status}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* RECORD PAYOUT MODAL */}
      {activeSeller && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40">
          <div className="glass glass-ring rounded-[24px] bg-white max-w-sm w-full mx-4 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Record payout
                </div>
                <div className="text-sm font-bold text-slate-900">
                  {activeSeller.name}
                </div>
              </div>
              <button
                type="button"
                onClick={closeRecordModal}
                className="text-xs text-slate-500 hover:text-slate-800"
                disabled={modalSaving}
              >
                ✕
              </button>
            </div>

            <div className="text-[11px] text-slate-600 mb-2">
              Remaining pending balance:{" "}
              <span className="font-semibold text-slate-900">
                {formatMoney(activeSeller.totalPendingCents)}
              </span>
            </div>

            <form onSubmit={handleRecordSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Amount to mark as paid
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={modalAmount}
                  onChange={(e) => setModalAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
                />
                <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                  <span>Max: {formatMoney(activeSeller.totalPendingCents)}</span>
                  <button
                    type="button"
                    className="underline hover:text-slate-800"
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
                <div className="text-[11px] text-rose-600">{modalError}</div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeRecordModal}
                  disabled={modalSaving}
                  className="px-3 py-2 rounded-xl text-[11px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="px-4 py-2 rounded-xl text-[11px] font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {modalSaving ? "Saving…" : "Save payout"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}