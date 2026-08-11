"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ProductStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "rejected"
  | "archived"
  | "delisted"
  | string;

type SellerProfile = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
};

type SizeVariant = {
  stock?: number | null;
};

type ProductRow = {
  id: string;
  seller_id: string | null;
  name: string;
  status: ProductStatus;
  is_active: boolean | null;
  stock_quantity: number | null;
  size_variants: SizeVariant[] | null;
  created_at: string | null;
};

type OrderRef = {
  created_at: string | null;
  status: string | null;
  payment_status: string | null;
} | null;

type OrderItemRow = {
  id: string;
  seller_id: string | null;
  product_id: string | null;
  name_snapshot: string | null;
  quantity: number | null;
  line_total_cents: number | null;
  order_id: string | null;
  orders: OrderRef | OrderRef[];
};

type PayoutRow = {
  id: string;
  seller_id: string;
  status: string | null;
  calculated_amount_cents: number | null;
  adjusted_amount_cents: number | null;
  paid_at: string | null;
};

type TopProduct = {
  productId: string;
  name: string;
  unitsSold: number;
  revenueCents: number;
};

type StockAlert = {
  id: string;
  name: string;
  stock: number;
  level: "out" | "low";
};

type SellerProduct = {
  id: string;
  name: string;
  status: ProductStatus;
  isActive: boolean;
  stock: number;
  createdAt: string | null;
};

type SellerSummary = {
  id: string;
  name: string;
  contact: string;
  totalProducts: number;
  approvedProducts: number;
  submittedProducts: number;
  delistedProducts: number;
  outOfStockCount: number;
  lowStockCount: number;
  dailySalesCents: number;
  weeklySalesCents: number;
  monthlySalesCents: number;
  dailyOrders: number;
  weeklyOrders: number;
  monthlyOrders: number;
  pendingPaymentCents: number;
  paidPayoutCents: number;
  pendingPayoutCents: number;
  topProducts: TopProduct[];
  stockAlerts: StockAlert[];
  productList: SellerProduct[];
};

function moneyCompact(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "ETB 0";
  const value = cents / 100;
  if (value >= 1_000_000) return `ETB ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `ETB ${(value / 1_000).toFixed(1)}K`;
  return `ETB ${value.toFixed(0)}`;
}

function getOrderMeta(item: OrderItemRow): OrderRef {
  if (Array.isArray(item.orders)) return item.orders[0] ?? null;
  return item.orders ?? null;
}

function getProductStock(product: ProductRow) {
  if (Array.isArray(product.size_variants) && product.size_variants.length > 0) {
    return product.size_variants.reduce(
      (sum, variant) => sum + Math.max(0, Number(variant?.stock ?? 0)),
      0
    );
  }
  return Math.max(0, Number(product.stock_quantity ?? 0));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const AVATAR_TONES = [
  "from-sky-100 to-sky-200 text-sky-700",
  "from-emerald-100 to-emerald-200 text-emerald-700",
  "from-violet-100 to-violet-200 text-violet-700",
  "from-amber-100 to-amber-200 text-amber-700",
  "from-rose-100 to-rose-200 text-rose-700",
  "from-teal-100 to-teal-200 text-teal-700",
];

export default function AdminApprovedSellersPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedSellerId, setExpandedSellerId] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<"products" | "top" | "stock">("products");

  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [sales, setSales] = useState<OrderItemRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user;

        if (!user) {
          router.replace("/auth/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!alive) return;

        if (error || !data || data.role !== "admin") {
          router.replace("/");
          return;
        }

        setIsAdmin(true);
      } finally {
        if (alive) setChecking(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [router]);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;

    async function load() {
      setLoading(true);
      setPageError(null);

      try {
        const [
          { data: productRows, error: productError },
          { data: salesRows, error: salesError },
          { data: payoutRows, error: payoutError },
          { data: sellerDocRows },
        ] = await Promise.all([
          supabase
            .from("products")
            .select("id, seller_id, name, status, is_active, stock_quantity, size_variants, created_at"),
          supabase
            .from("order_items")
            .select(
              "id, seller_id, product_id, name_snapshot, quantity, line_total_cents, order_id, orders(created_at, status, payment_status)"
            )
            .order("order_id", { ascending: false }),
          supabase
            .from("seller_payouts")
            .select("id, seller_id, status, calculated_amount_cents, adjusted_amount_cents, paid_at"),
          supabase.from("seller_documents").select("seller_id"),
        ]);

        if (!alive) return;

        if (productError || salesError || payoutError) {
          throw new Error(
            productError?.message ||
              salesError?.message ||
              payoutError?.message ||
              "Failed to load approved seller management."
          );
        }

        const sellerIdSet = new Set<string>();
        for (const p of productRows ?? []) {
          if (p.seller_id) sellerIdSet.add(p.seller_id);
        }
        for (const d of sellerDocRows ?? []) {
          if (d.seller_id) sellerIdSet.add(d.seller_id);
        }
        for (const s of salesRows ?? []) {
          if (s.seller_id) sellerIdSet.add(s.seller_id);
        }
        for (const pay of payoutRows ?? []) {
          if (pay.seller_id) sellerIdSet.add(pay.seller_id);
        }

        let sellerProfiles: SellerProfile[] = [];

        const roleRes = await fetch("/api/admin/profiles?role=seller");
        if (roleRes.ok) {
          const roleData = await roleRes.json();
          for (const p of roleData.profiles ?? []) {
            if (p.id) sellerIdSet.add(p.id);
          }
        }

        const allSellerIds = Array.from(sellerIdSet);
        if (allSellerIds.length > 0) {
          const profRes = await fetch(`/api/admin/profiles?ids=${allSellerIds.join(",")}`);
          if (profRes.ok) {
            const profData = await profRes.json();
            sellerProfiles = (profData.profiles ?? []) as SellerProfile[];
          }
        }

        setSellers(sellerProfiles);
        setProducts((productRows ?? []) as ProductRow[]);
        setSales((salesRows ?? []) as OrderItemRow[]);
        setPayouts((payoutRows ?? []) as PayoutRow[]);
      } catch (err) {
        const message =
          err && typeof err === "object" && "message" in err
            ? String((err as { message?: string }).message)
            : "Failed to load approved seller management.";
        if (!alive) return;
        setPageError(message);
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const sellerSummaries = useMemo<SellerSummary[]>(() => {
    const now = new Date();
    const today = startOfDay(now);
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const productsBySeller: Record<string, ProductRow[]> = {};
    for (const product of products) {
      if (!product.seller_id) continue;
      if (!productsBySeller[product.seller_id]) productsBySeller[product.seller_id] = [];
      productsBySeller[product.seller_id].push(product);
    }

    const salesBySeller: Record<string, OrderItemRow[]> = {};
    for (const sale of sales) {
      if (!sale.seller_id) continue;
      const order = getOrderMeta(sale);
      if ((order?.status ?? "").toLowerCase() === "cancelled") continue;
      if (!salesBySeller[sale.seller_id]) salesBySeller[sale.seller_id] = [];
      salesBySeller[sale.seller_id].push(sale);
    }

    const payoutsBySeller: Record<string, PayoutRow[]> = {};
    for (const payout of payouts) {
      if (!payout.seller_id) continue;
      if (!payoutsBySeller[payout.seller_id]) payoutsBySeller[payout.seller_id] = [];
      payoutsBySeller[payout.seller_id].push(payout);
    }

    return sellers
      .filter((seller) => seller.role === "seller")
      .map((seller) => {
        const sellerProducts = productsBySeller[seller.id] ?? [];
        const sellerSales = salesBySeller[seller.id] ?? [];
        const sellerPayouts = payoutsBySeller[seller.id] ?? [];

        let dailySalesCents = 0;
        let weeklySalesCents = 0;
        let monthlySalesCents = 0;
        let pendingPaymentCents = 0;

        const dailyOrderIds = new Set<string>();
        const weeklyOrderIds = new Set<string>();
        const monthlyOrderIds = new Set<string>();
        const topProductsMap = new Map<string, TopProduct>();

        for (const sale of sellerSales) {
          const order = getOrderMeta(sale);
          const createdAt = order?.created_at ? new Date(order.created_at) : null;
          const amount = Math.max(0, Number(sale.line_total_cents ?? 0));
          const qty = Math.max(0, Number(sale.quantity ?? 0));
          const paymentStatus = (order?.payment_status ?? "").toLowerCase();
          const orderId = sale.order_id ?? sale.id;

          if (paymentStatus !== "paid") {
            pendingPaymentCents += amount;
          }

          if (createdAt && createdAt >= today) {
            dailySalesCents += amount;
            dailyOrderIds.add(orderId);
          }
          if (createdAt && createdAt >= weekAgo) {
            weeklySalesCents += amount;
            weeklyOrderIds.add(orderId);
          }
          if (createdAt && createdAt >= monthStart) {
            monthlySalesCents += amount;
            monthlyOrderIds.add(orderId);
          }

          const topKey = sale.product_id || sale.name_snapshot || sale.id;
          const prev = topProductsMap.get(topKey);
          if (prev) {
            prev.unitsSold += qty;
            prev.revenueCents += amount;
          } else {
            topProductsMap.set(topKey, {
              productId: sale.product_id || sale.id,
              name: sale.name_snapshot || "Unnamed product",
              unitsSold: qty,
              revenueCents: amount,
            });
          }
        }

        let pendingPayoutCents = 0;
        let paidPayoutCents = 0;
        for (const payout of sellerPayouts) {
          const amount =
            payout.adjusted_amount_cents ?? payout.calculated_amount_cents ?? 0;
          if (amount <= 0) continue;
          if ((payout.status ?? "").toLowerCase() === "paid") {
            paidPayoutCents += amount;
          } else {
            pendingPayoutCents += amount;
          }
        }

        const stockAlerts: StockAlert[] = sellerProducts
          .filter((p) => p.status !== "delisted" && p.is_active !== false)
          .map((product) => {
            const stock = getProductStock(product);
            if (stock <= 0) {
              return { id: product.id, name: product.name, stock, level: "out" as const };
            }
            if (stock <= 5) {
              return { id: product.id, name: product.name, stock, level: "low" as const };
            }
            return null;
          })
          .filter((item): item is StockAlert => item !== null)
          .sort((a, b) => a.stock - b.stock);

        return {
          id: seller.id,
          name:
            seller.display_name?.trim() ||
            seller.full_name?.trim() ||
            seller.phone?.trim() ||
            "Seller",
          contact: seller.phone?.trim() || "No contact",
          totalProducts: sellerProducts.length,
          approvedProducts: sellerProducts.filter((p) => p.status === "approved" && p.is_active !== false).length,
          submittedProducts: sellerProducts.filter((p) => p.status === "submitted").length,
          delistedProducts: sellerProducts.filter((p) => p.status === "delisted" || p.is_active === false).length,
          outOfStockCount: stockAlerts.filter((item) => item.level === "out").length,
          lowStockCount: stockAlerts.filter((item) => item.level === "low").length,
          dailySalesCents,
          weeklySalesCents,
          monthlySalesCents,
          dailyOrders: dailyOrderIds.size,
          weeklyOrders: weeklyOrderIds.size,
          monthlyOrders: monthlyOrderIds.size,
          pendingPaymentCents,
          paidPayoutCents,
          pendingPayoutCents,
          topProducts: Array.from(topProductsMap.values())
            .sort((a, b) => b.revenueCents - a.revenueCents)
            .slice(0, 4),
          stockAlerts: stockAlerts.slice(0, 6),
          productList: sellerProducts
            .map((p) => ({
              id: p.id,
              name: p.name,
              status: p.status,
              isActive: p.is_active !== false,
              stock: getProductStock(p),
              createdAt: p.created_at,
            }))
            .sort((a, b) => {
              const order: Record<string, number> = { approved: 0, submitted: 1, draft: 2, rejected: 3, delisted: 4, archived: 5 };
              return (order[a.status] ?? 6) - (order[b.status] ?? 6);
            }),
        };
      })
      .sort((a, b) => b.monthlySalesCents - a.monthlySalesCents);
  }, [products, sales, payouts, sellers]);

  const filteredSellers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sellerSummaries;
    return sellerSummaries.filter(
      (seller) =>
        seller.name.toLowerCase().includes(q) ||
        seller.contact.toLowerCase().includes(q)
    );
  }, [search, sellerSummaries]);

  const totals = useMemo(() => {
    return sellerSummaries.reduce(
      (acc, seller) => {
        acc.dailySalesCents += seller.dailySalesCents;
        acc.weeklySalesCents += seller.weeklySalesCents;
        acc.monthlySalesCents += seller.monthlySalesCents;
        acc.pendingPaymentCents += seller.pendingPaymentCents;
        acc.pendingPayoutCents += seller.pendingPayoutCents;
        acc.outOfStockCount += seller.outOfStockCount;
        acc.lowStockCount += seller.lowStockCount;
        return acc;
      },
      {
        dailySalesCents: 0,
        weeklySalesCents: 0,
        monthlySalesCents: 0,
        pendingPaymentCents: 0,
        pendingPayoutCents: 0,
        outOfStockCount: 0,
        lowStockCount: 0,
      }
    );
  }, [sellerSummaries]);

  if (checking) {
    return (
      <main className="py-4 md:py-6">
        <div className="glass glass-ring rounded-[28px] p-6 text-sm text-slate-700">
          Checking admin access...
        </div>
      </main>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="py-4 md:py-6 space-y-4">
      {/* Dark hero header */}
      <section className="relative overflow-hidden rounded-[28px] bg-slate-900 p-5 md:p-6 shadow-xl shadow-slate-900/20">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-10 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Admin · Marketplace</div>
            <h1 className="mt-0.5 text-2xl font-bold text-white">Approved Sellers</h1>
            <p className="mt-1 text-xs text-slate-400">
              {sellerSummaries.length} seller{sellerSummaries.length === 1 ? "" : "s"} · sales, payouts & inventory at a glance
            </p>
          </div>
          <button
            onClick={() => router.push("/admin")}
            className="shrink-0 rounded-xl border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
          >
            Back to Admin
          </button>
        </div>

        {/* KPI tiles */}
        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Today", value: moneyCompact(totals.dailySalesCents), tone: "text-white" },
            { label: "7 days", value: moneyCompact(totals.weeklySalesCents), tone: "text-white" },
            { label: "This month", value: moneyCompact(totals.monthlySalesCents), tone: "text-white" },
            {
              label: "Pending pay",
              value: moneyCompact(totals.pendingPaymentCents),
              tone: totals.pendingPaymentCents > 0 ? "text-amber-300" : "text-white/40",
            },
            {
              label: "Pending payout",
              value: moneyCompact(totals.pendingPayoutCents),
              tone: totals.pendingPayoutCents > 0 ? "text-rose-300" : "text-white/40",
            },
            {
              label: "Stock issues",
              value: `${totals.outOfStockCount + totals.lowStockCount}`,
              sub: `${totals.outOfStockCount} out · ${totals.lowStockCount} low`,
              tone: totals.outOfStockCount + totals.lowStockCount > 0 ? "text-rose-300" : "text-white/40",
            },
          ].map(({ label, value, sub, tone }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
              <div className={`mt-0.5 truncate text-base font-bold tabular-nums ${tone}`}>{value}</div>
              {sub && <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>}
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <svg className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full rounded-2xl border border-white/10 bg-white/95 py-2.5 pl-11 pr-24 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:bg-white"
          />
          {search.trim() && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
              {filteredSellers.length} match{filteredSellers.length === 1 ? "" : "es"}
            </span>
          )}
        </div>
      </section>

      {pageError && (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {pageError}
        </div>
      )}

      {loading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
            <div className="text-sm text-slate-500">Loading seller data...</div>
          </div>
        </div>
      ) : filteredSellers.length === 0 ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
            <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
          </div>
          <div className="mt-3 text-lg font-bold text-slate-900">No sellers found</div>
          <div className="mt-1 text-sm text-slate-500">
            Try a different search or approve seller documents first.
          </div>
        </div>
      ) : (
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
          {/* Desktop column header */}
          <div className="hidden border-b border-slate-100 bg-slate-50/80 px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 md:grid md:grid-cols-[minmax(0,1fr)_88px_88px_112px_44px] md:items-center md:gap-3">
            <span>Seller</span>
            <span className="text-right">Today</span>
            <span className="text-right">7 days</span>
            <span className="text-right">This month</span>
            <span aria-hidden />
          </div>
          <div className="divide-y divide-slate-100">
          {filteredSellers.map((seller, idx) => {
            const expanded = expandedSellerId === seller.id;
            const avatarTone = AVATAR_TONES[seller.name.charCodeAt(0) % AVATAR_TONES.length];
            const maxSales = Math.max(seller.dailySalesCents, seller.weeklySalesCents, seller.monthlySalesCents, 1);

            return (
              <article key={seller.id} className={expanded ? "bg-slate-50/50" : undefined}>
                {/* Collapsed row */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-slate-50/60 md:grid-cols-[minmax(0,1fr)_88px_88px_112px_44px] md:gap-3 md:px-5">
                  {/* Identity */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold ${avatarTone}`}>
                      {seller.name.charAt(0).toUpperCase()}
                      {idx < 3 && seller.monthlySalesCents > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[8px] font-bold text-white ring-2 ring-white">
                          {idx + 1}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-slate-900">{seller.name}</span>
                        {seller.pendingPaymentCents > 0 && (
                          <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">pay due</span>
                        )}
                        {seller.outOfStockCount > 0 && (
                          <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">{seller.outOfStockCount} out</span>
                        )}
                        {seller.lowStockCount > 0 && (
                          <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">{seller.lowStockCount} low</span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-slate-400">
                        <span>{seller.contact}</span>
                        <span className="mx-1 text-slate-300">·</span>
                        {seller.totalProducts === 0 ? (
                          <span>No products</span>
                        ) : (
                          <>
                            {seller.approvedProducts > 0 && (
                              <span className="font-medium text-emerald-600">{seller.approvedProducts} live</span>
                            )}
                            {seller.submittedProducts > 0 && (
                              <>
                                {seller.approvedProducts > 0 && <span className="mx-1 text-slate-300">·</span>}
                                <span className="font-medium text-sky-600">{seller.submittedProducts} pending</span>
                              </>
                            )}
                            {seller.delistedProducts > 0 && (
                              <>
                                {(seller.approvedProducts > 0 || seller.submittedProducts > 0) && (
                                  <span className="mx-1 text-slate-300">·</span>
                                )}
                                <span>{seller.delistedProducts} delisted</span>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Desktop metrics */}
                  <div className="hidden text-right md:block">
                    <div className={`text-[13px] font-semibold tabular-nums ${seller.dailySalesCents > 0 ? "text-slate-800" : "text-slate-300"}`}>
                      {moneyCompact(seller.dailySalesCents)}
                    </div>
                    <div className="text-[10px] text-slate-400">{seller.dailyOrders} orders</div>
                  </div>
                  <div className="hidden text-right md:block">
                    <div className={`text-[13px] font-semibold tabular-nums ${seller.weeklySalesCents > 0 ? "text-slate-800" : "text-slate-300"}`}>
                      {moneyCompact(seller.weeklySalesCents)}
                    </div>
                    <div className="text-[10px] text-slate-400">{seller.weeklyOrders} orders</div>
                  </div>
                  <div className="hidden text-right md:block">
                    <div className={`text-[13px] font-bold tabular-nums ${seller.monthlySalesCents > 0 ? "text-slate-900" : "text-slate-300"}`}>
                      {moneyCompact(seller.monthlySalesCents)}
                    </div>
                    <div className="text-[10px] text-slate-400">{seller.monthlyOrders} orders</div>
                  </div>

                  {/* Expand toggle */}
                  <button
                    onClick={() => {
                      setExpandedSellerId(expanded ? null : seller.id);
                      setExpandedTab("products");
                    }}
                    aria-expanded={expanded}
                    aria-label={expanded ? `Hide ${seller.name} details` : `Show ${seller.name} details`}
                    className="flex h-8 w-8 items-center justify-center justify-self-end rounded-full border border-slate-200 bg-white text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-700"
                  >
                    <svg
                      className={`h-4 w-4 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Mobile metrics strip */}
                  <div className="col-span-2 flex items-center gap-3 pl-[46px] text-[11px] text-slate-500 md:hidden">
                    <span>
                      Today <span className="font-semibold text-slate-700">{moneyCompact(seller.dailySalesCents)}</span>
                    </span>
                    <span>
                      7d <span className="font-semibold text-slate-700">{moneyCompact(seller.weeklySalesCents)}</span>
                    </span>
                    <span>
                      Mo <span className="font-semibold text-slate-900">{moneyCompact(seller.monthlySalesCents)}</span>{" "}
                      <span className="text-slate-400">({seller.monthlyOrders})</span>
                    </span>
                  </div>
                </div>

                {/* Expanded panel */}
                {expanded && (
                  <div className="space-y-4 border-t border-slate-100 bg-gradient-to-b from-slate-50 to-white px-4 py-4 md:px-5">
                    {/* Sales performance */}
                    <div>
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Sales performance</div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Today", cents: seller.dailySalesCents, orders: seller.dailyOrders },
                          { label: "7 days", cents: seller.weeklySalesCents, orders: seller.weeklyOrders },
                          { label: "This month", cents: seller.monthlySalesCents, orders: seller.monthlyOrders },
                        ].map(({ label, cents, orders }) => (
                          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
                            <div className="mt-0.5 truncate text-sm font-bold tabular-nums text-slate-900">{moneyCompact(cents)}</div>
                            <div className="text-[10px] text-slate-400">{orders} order{orders === 1 ? "" : "s"}</div>
                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-slate-900"
                                style={{ width: `${Math.max(cents > 0 ? 6 : 0, Math.round((cents / maxSales) * 100))}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Payments & payouts */}
                    <div>
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Payments & payouts</div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-600/80">Pending pay</div>
                          <div className="mt-0.5 truncate text-sm font-bold tabular-nums text-amber-900">{moneyCompact(seller.pendingPaymentCents)}</div>
                          <div className="text-[10px] text-amber-600/60">customer unpaid</div>
                        </div>
                        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-600/80">Pending payout</div>
                          <div className="mt-0.5 truncate text-sm font-bold tabular-nums text-rose-900">{moneyCompact(seller.pendingPayoutCents)}</div>
                          <div className="text-[10px] text-rose-600/60">owed to seller</div>
                        </div>
                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600/80">Paid out</div>
                          <div className="mt-0.5 truncate text-sm font-bold tabular-nums text-emerald-900">{moneyCompact(seller.paidPayoutCents)}</div>
                          <div className="text-[10px] text-emerald-600/60">recorded</div>
                        </div>
                      </div>
                    </div>

                    {/* Tabbed lists */}
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                      <div className="flex border-b border-slate-100" role="tablist" aria-label="Seller details">
                        {([
                          { key: "products" as const, label: "Products", count: seller.productList.length },
                          { key: "top" as const, label: "Top sellers", count: seller.topProducts.length },
                          { key: "stock" as const, label: "Stock alerts", count: seller.stockAlerts.length },
                        ]).map(({ key, label, count }) => (
                          <button
                            key={key}
                            role="tab"
                            aria-selected={expandedTab === key}
                            onClick={() => setExpandedTab(key)}
                            className={`flex-1 px-2 py-2.5 text-xs font-semibold transition-colors ${
                              expandedTab === key
                                ? "border-b-2 border-slate-900 text-slate-900"
                                : "border-b-2 border-transparent text-slate-400 hover:text-slate-600"
                            }`}
                          >
                            {label}
                            <span
                              className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                                key === "stock" && count > 0
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {count}
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="max-h-64 divide-y divide-slate-50 overflow-y-auto">
                        {expandedTab === "products" &&
                          (seller.productList.length === 0 ? (
                            <p className="px-4 py-4 text-center text-sm text-slate-400">No products.</p>
                          ) : (
                            seller.productList.map((product) => (
                              <div
                                key={product.id}
                                className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm text-slate-900">{product.name}</div>
                                  <div className="text-[11px] text-slate-400">
                                    Stock: {product.stock} ·{" "}
                                    {product.createdAt
                                      ? new Date(product.createdAt).toLocaleDateString()
                                      : "—"}
                                  </div>
                                </div>
                                <span
                                  className={[
                                    "ml-3 shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                                    product.status === "approved" && product.isActive
                                      ? "bg-emerald-100 text-emerald-700"
                                      : product.status === "submitted"
                                      ? "bg-sky-100 text-sky-700"
                                      : product.status === "delisted" || !product.isActive
                                      ? "bg-rose-100 text-rose-700"
                                      : product.status === "rejected"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-slate-100 text-slate-500",
                                  ].join(" ")}
                                >
                                  {product.status === "approved" && product.isActive
                                    ? "Live"
                                    : !product.isActive
                                    ? "Inactive"
                                    : product.status}
                                </span>
                              </div>
                            ))
                          ))}

                        {expandedTab === "top" &&
                          (seller.topProducts.length === 0 ? (
                            <p className="px-4 py-4 text-center text-sm text-slate-400">No sales yet.</p>
                          ) : (
                            seller.topProducts.map((product, i) => (
                              <div
                                key={`${seller.id}-${product.productId}-${i}`}
                                className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50"
                              >
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-500">
                                    {i + 1}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="truncate text-sm text-slate-900">{product.name}</div>
                                    <div className="text-[11px] text-slate-400">{product.unitsSold} sold</div>
                                  </div>
                                </div>
                                <div className="ml-3 shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                                  {moneyCompact(product.revenueCents)}
                                </div>
                              </div>
                            ))
                          ))}

                        {expandedTab === "stock" &&
                          (seller.stockAlerts.length === 0 ? (
                            <p className="px-4 py-4 text-center text-sm text-slate-400">No stock issues.</p>
                          ) : (
                            seller.stockAlerts.map((alert) => (
                              <div
                                key={`${seller.id}-${alert.id}`}
                                className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50"
                              >
                                <div className="min-w-0">
                                  <div className="truncate text-sm text-slate-900">{alert.name}</div>
                                  <div className="text-[11px] text-slate-400">
                                    {alert.level === "out" ? "Out of stock" : "Low stock"}
                                  </div>
                                </div>
                                <span
                                  className={[
                                    "text-[10px] font-bold px-2 py-0.5 rounded-full ml-3 shrink-0",
                                    alert.level === "out"
                                      ? "bg-rose-100 text-rose-700"
                                      : "bg-amber-100 text-amber-700",
                                  ].join(" ")}
                                >
                                  {alert.stock} left
                                </span>
                              </div>
                            ))
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          </div>
        </section>
      )}
    </main>
  );
}
