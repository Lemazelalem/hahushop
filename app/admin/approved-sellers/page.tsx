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

export default function AdminApprovedSellersPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expandedSellerId, setExpandedSellerId] = useState<string | null>(null);

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
      {/* Compact header */}
      <section className="glass glass-ring rounded-[28px] p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Admin</div>
            <h1 className="text-2xl font-bold text-slate-900 mt-0.5">Approved Sellers</h1>
          </div>
          <button
            onClick={() => router.push("/admin")}
            className="pill px-4 py-1.5 text-sm font-semibold text-slate-900 shrink-0"
          >
            Back to Admin
          </button>
        </div>

        {/* Compact summary strip */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-semibold text-slate-900">{sellerSummaries.length} sellers</span>
          <span className="text-slate-500">
            Today <span className="font-semibold text-slate-800">{moneyCompact(totals.dailySalesCents)}</span>
          </span>
          <span className="text-slate-500">
            7d <span className="font-semibold text-slate-800">{moneyCompact(totals.weeklySalesCents)}</span>
          </span>
          <span className="text-slate-500">
            Month <span className="font-semibold text-slate-800">{moneyCompact(totals.monthlySalesCents)}</span>
          </span>
          {totals.pendingPaymentCents > 0 && (
            <span className="text-amber-700">
              Pending pay <span className="font-semibold">{moneyCompact(totals.pendingPaymentCents)}</span>
            </span>
          )}
          {totals.pendingPayoutCents > 0 && (
            <span className="text-rose-700">
              Pending payout <span className="font-semibold">{moneyCompact(totals.pendingPayoutCents)}</span>
            </span>
          )}
          {(totals.outOfStockCount + totals.lowStockCount) > 0 && (
            <span className="text-rose-600">
              {totals.outOfStockCount} out · {totals.lowStockCount} low stock
            </span>
          )}
        </div>

        <div className="mt-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-300"
          />
        </div>
      </section>

      {pageError && (
        <div className="glass glass-ring rounded-[24px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {pageError}
        </div>
      )}

      {loading ? (
        <div className="glass glass-ring rounded-[28px] p-8 text-center text-sm text-slate-500">
          Loading seller data...
        </div>
      ) : filteredSellers.length === 0 ? (
        <div className="glass glass-ring rounded-[28px] p-10 text-center">
          <div className="text-lg font-bold text-slate-900">No sellers found</div>
          <div className="mt-1 text-sm text-slate-500">
            Try a different search or approve seller documents first.
          </div>
        </div>
      ) : (
        <section className="glass glass-ring rounded-[28px] divide-y divide-slate-100 overflow-hidden">
          {filteredSellers.map((seller) => {
            const expanded = expandedSellerId === seller.id;

            return (
              <article key={seller.id}>
                {/* Compact collapsed row */}
                <div className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-slate-900 text-sm">{seller.name}</span>
                      <span className="text-xs text-slate-400">{seller.contact}</span>
                      {seller.pendingPaymentCents > 0 && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          pay pending
                        </span>
                      )}
                      {seller.outOfStockCount > 0 && (
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                          {seller.outOfStockCount} out of stock
                        </span>
                      )}
                      {seller.lowStockCount > 0 && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          {seller.lowStockCount} low stock
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                      {seller.approvedProducts > 0 && (
                        <span className="text-emerald-700 font-medium">{seller.approvedProducts} live</span>
                      )}
                      {seller.submittedProducts > 0 && (
                        <span className="text-sky-700 font-medium">{seller.submittedProducts} pending</span>
                      )}
                      {seller.delistedProducts > 0 && (
                        <span className="text-slate-400">{seller.delistedProducts} delisted</span>
                      )}
                      {seller.totalProducts === 0 && (
                        <span className="text-slate-400">No products</span>
                      )}
                      <span className="text-slate-300">·</span>
                      <span>
                        Month{" "}
                        <span className="font-semibold text-slate-700">
                          {moneyCompact(seller.monthlySalesCents)}
                        </span>{" "}
                        <span className="text-slate-400">({seller.monthlyOrders} orders)</span>
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setExpandedSellerId(expanded ? null : seller.id)}
                    className="shrink-0 text-xs font-semibold text-slate-600 border border-slate-200 bg-white rounded-xl px-3 py-1.5 hover:bg-slate-50 transition-colors"
                  >
                    {expanded ? "Hide ↑" : "Details ↓"}
                  </button>
                </div>

                {/* Expanded panel */}
                {expanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4 space-y-3">
                    {/* Compact 6-cell financials grid */}
                    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 text-center">
                      {[
                        {
                          label: "Today",
                          value: moneyCompact(seller.dailySalesCents),
                          sub: `${seller.dailyOrders} orders`,
                          cls: "bg-white border-slate-200 text-slate-900",
                        },
                        {
                          label: "7 Days",
                          value: moneyCompact(seller.weeklySalesCents),
                          sub: `${seller.weeklyOrders} orders`,
                          cls: "bg-white border-slate-200 text-slate-900",
                        },
                        {
                          label: "Month",
                          value: moneyCompact(seller.monthlySalesCents),
                          sub: `${seller.monthlyOrders} orders`,
                          cls: "bg-white border-slate-200 text-slate-900",
                        },
                        {
                          label: "Pending Pay",
                          value: moneyCompact(seller.pendingPaymentCents),
                          sub: "customer unpaid",
                          cls: "bg-amber-50 border-amber-100 text-amber-900",
                        },
                        {
                          label: "Pending Payout",
                          value: moneyCompact(seller.pendingPayoutCents),
                          sub: "owed to seller",
                          cls: "bg-rose-50 border-rose-100 text-rose-900",
                        },
                        {
                          label: "Paid Out",
                          value: moneyCompact(seller.paidPayoutCents),
                          sub: "recorded",
                          cls: "bg-emerald-50 border-emerald-100 text-emerald-900",
                        },
                      ].map(({ label, value, sub, cls }) => (
                        <div key={label} className={`rounded-2xl border p-2.5 ${cls}`}>
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {label}
                          </div>
                          <div className="text-sm font-bold mt-0.5">{value}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Products collapsible */}
                    <details className="group rounded-[20px] border border-slate-200 bg-white overflow-hidden">
                      <summary className="cursor-pointer list-none px-4 py-2.5 flex items-center justify-between select-none hover:bg-slate-50 transition-colors">
                        <span className="text-sm font-semibold text-slate-900">
                          Products{" "}
                          <span className="font-normal text-slate-400">({seller.productList.length})</span>
                        </span>
                        <svg
                          className="h-4 w-4 text-slate-400 transition-transform duration-150 group-open:rotate-180"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </summary>
                      <div className="border-t border-slate-100 max-h-60 overflow-y-auto divide-y divide-slate-50">
                        {seller.productList.length === 0 ? (
                          <p className="px-4 py-3 text-sm text-slate-400">No products.</p>
                        ) : (
                          seller.productList.map((product) => (
                            <div
                              key={product.id}
                              className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-slate-900 truncate">{product.name}</div>
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
                        )}
                      </div>
                    </details>

                    <div className="grid gap-3 lg:grid-cols-2">
                      {/* Top products collapsible */}
                      <details className="group rounded-[20px] border border-slate-200 bg-white overflow-hidden">
                        <summary className="cursor-pointer list-none px-4 py-2.5 flex items-center justify-between select-none hover:bg-slate-50 transition-colors">
                          <span className="text-sm font-semibold text-slate-900">
                            Top Products{" "}
                            <span className="font-normal text-slate-400">({seller.topProducts.length})</span>
                          </span>
                          <svg
                            className="h-4 w-4 text-slate-400 transition-transform duration-150 group-open:rotate-180"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </summary>
                        <div className="border-t border-slate-100 divide-y divide-slate-50">
                          {seller.topProducts.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-slate-400">No sales yet.</p>
                          ) : (
                            seller.topProducts.map((product, i) => (
                              <div
                                key={`${seller.id}-${product.productId}-${i}`}
                                className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm text-slate-900 truncate">{product.name}</div>
                                  <div className="text-[11px] text-slate-400">{product.unitsSold} sold</div>
                                </div>
                                <div className="text-sm font-semibold text-slate-900 ml-3 shrink-0">
                                  {moneyCompact(product.revenueCents)}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </details>

                      {/* Stock alerts collapsible */}
                      <details className="group rounded-[20px] border border-slate-200 bg-white overflow-hidden">
                        <summary className="cursor-pointer list-none px-4 py-2.5 flex items-center justify-between select-none hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900">Stock Alerts</span>
                            {seller.stockAlerts.length > 0 && (
                              <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
                                {seller.stockAlerts.length}
                              </span>
                            )}
                          </div>
                          <svg
                            className="h-4 w-4 text-slate-400 transition-transform duration-150 group-open:rotate-180"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </summary>
                        <div className="border-t border-slate-100 divide-y divide-slate-50">
                          {seller.stockAlerts.length === 0 ? (
                            <p className="px-4 py-3 text-sm text-slate-400">No stock issues.</p>
                          ) : (
                            seller.stockAlerts.map((alert) => (
                              <div
                                key={`${seller.id}-${alert.id}`}
                                className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm text-slate-900 truncate">{alert.name}</div>
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
                          )}
                        </div>
                      </details>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
