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

function money(cents: number | null | undefined) {
  if (!cents || cents <= 0) return "ETB 0.00";
  return `ETB ${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

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
        // 1) Fetch products, order_items, payouts, and seller_documents in parallel
        const [
          { data: productRows, error: productError },
          { data: salesRows, error: salesError },
          { data: payoutRows, error: payoutError },
          { data: sellerDocRows, error: sellerDocError },
          { data: roleSellerRows, error: roleSellerError },
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
          supabase
            .from("profiles")
            .select("id")
            .eq("role", "seller"),
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

        // 2) Collect all unique seller IDs from multiple sources
        const sellerIdSet = new Set<string>();
        for (const p of productRows ?? []) {
          if (p.seller_id) sellerIdSet.add(p.seller_id);
        }
        for (const d of sellerDocRows ?? []) {
          if (d.seller_id) sellerIdSet.add(d.seller_id);
        }
        for (const r of roleSellerRows ?? []) {
          if (r.id) sellerIdSet.add(r.id);
        }
        for (const s of salesRows ?? []) {
          if (s.seller_id) sellerIdSet.add(s.seller_id);
        }
        for (const pay of payoutRows ?? []) {
          if (pay.seller_id) sellerIdSet.add(pay.seller_id);
        }

        // 3) Fetch profiles for all discovered seller IDs
        let sellerProfiles: SellerProfile[] = [];
        const sellerIds = Array.from(sellerIdSet);
        if (sellerIds.length > 0) {
          const { data: profileData, error: profileErr } = await supabase
            .from("profiles")
            .select("id, display_name, full_name, phone, role")
            .in("id", sellerIds);

          if (profileErr) {
            console.error("[approved-sellers] profiles fetch error:", profileErr);
          }
          sellerProfiles = (profileData ?? []) as SellerProfile[];
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
    <main className="py-4 md:py-6 space-y-6">
      <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
              Admin
            </div>
            <h1 className="mt-1 text-3xl font-bold text-slate-900 md:text-4xl">
              Approved Sellers
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-700 md:text-base">
              Manage approved sellers with daily sales, pending customer payments,
              payout exposure, stock health, and product performance in one place.
            </p>
          </div>

          <button
            onClick={() => router.push("/admin")}
            className="pill px-5 py-2 text-sm font-semibold text-slate-900"
          >
            Back to Admin
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
          <div className="glass glass-ring rounded-[24px] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Sellers
            </div>
            <div className="mt-1 text-3xl font-bold text-slate-900">
              {sellerSummaries.length}
            </div>
          </div>
          <div className="glass glass-ring rounded-[24px] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Today Sales
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {moneyCompact(totals.dailySalesCents)}
            </div>
          </div>
          <div className="glass glass-ring rounded-[24px] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              7 Day Sales
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {moneyCompact(totals.weeklySalesCents)}
            </div>
          </div>
          <div className="glass glass-ring rounded-[24px] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pending Customer Pay
            </div>
            <div className="mt-1 text-2xl font-bold text-amber-900">
              {moneyCompact(totals.pendingPaymentCents)}
            </div>
          </div>
          <div className="glass glass-ring rounded-[24px] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pending Payout
            </div>
            <div className="mt-1 text-2xl font-bold text-rose-700">
              {moneyCompact(totals.pendingPayoutCents)}
            </div>
          </div>
          <div className="glass glass-ring rounded-[24px] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Stock Alerts
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">
              {totals.outOfStockCount + totals.lowStockCount}
            </div>
            <div className="mt-1 text-[11px] text-slate-500">
              {totals.outOfStockCount} out, {totals.lowStockCount} low
            </div>
          </div>
        </div>

        <div className="mt-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search approved sellers by name, phone, or email..."
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-300"
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
          Loading approved seller management...
        </div>
      ) : filteredSellers.length === 0 ? (
        <div className="glass glass-ring rounded-[28px] p-10 text-center">
          <div className="text-lg font-bold text-slate-900">No approved sellers found</div>
          <div className="mt-1 text-sm text-slate-500">
            Try a different search or approve seller documents first.
          </div>
        </div>
      ) : (
        <section className="space-y-4">
          {filteredSellers.map((seller) => {
            const expanded = expandedSellerId === seller.id;
            return (
              <article key={seller.id} className="glass glass-ring rounded-[28px] p-5 md:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-slate-900">{seller.name}</h2>
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                        Approved Seller
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{seller.contact}</div>
                  </div>

                  <button
                    onClick={() =>
                      setExpandedSellerId((current) => (current === seller.id ? null : seller.id))
                    }
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {expanded ? "Hide details" : "View details"}
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-6">
                  <MetricCard label="Today" value={moneyCompact(seller.dailySalesCents)} sub={`${seller.dailyOrders} orders`} />
                  <MetricCard label="7 Days" value={moneyCompact(seller.weeklySalesCents)} sub={`${seller.weeklyOrders} orders`} />
                  <MetricCard label="This Month" value={moneyCompact(seller.monthlySalesCents)} sub={`${seller.monthlyOrders} orders`} />
                  <MetricCard label="Pending Payment" value={moneyCompact(seller.pendingPaymentCents)} sub="Customer money not paid yet" tone="amber" />
                  <MetricCard label="Pending Payout" value={moneyCompact(seller.pendingPayoutCents)} sub="Admin still owes seller" tone="rose" />
                  <MetricCard label="Paid Out" value={moneyCompact(seller.paidPayoutCents)} sub="Recorded seller payouts" tone="emerald" />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-6">
                  <MetricCard label="Total Products" value={String(seller.totalProducts)} sub="All listings" compact />
                  <MetricCard label="Approved" value={String(seller.approvedProducts)} sub="Live products" compact tone="emerald" />
                  <MetricCard label="Submitted" value={String(seller.submittedProducts)} sub="Need review" compact tone="sky" />
                  <MetricCard label="Delisted" value={String(seller.delistedProducts)} sub="Inactive/delisted" compact tone="amber" />
                  <MetricCard label="Out of Stock" value={String(seller.outOfStockCount)} sub="Immediate attention" compact tone="rose" />
                  <MetricCard label="Low Stock" value={String(seller.lowStockCount)} sub="5 or fewer units" compact tone="amber" />
                </div>

                {expanded && (
                  <div className="mt-6 space-y-4">
                    {/* Full product list */}
                    <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
                      <div className="text-sm font-bold text-slate-900">Products ({seller.productList.length})</div>
                      <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto">
                        {seller.productList.length === 0 ? (
                          <div className="text-sm text-slate-500">No products listed by this seller.</div>
                        ) : (
                          seller.productList.map((product) => (
                            <div key={product.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2.5">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-slate-900">{product.name}</div>
                                <div className="text-[11px] text-slate-500">
                                  Stock: {product.stock} &middot; Added {product.createdAt ? new Date(product.createdAt).toLocaleDateString() : "—"}
                                </div>
                              </div>
                              <span className={[
                                "ml-2 shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase",
                                product.status === "approved" && product.isActive ? "bg-emerald-100 text-emerald-700" :
                                product.status === "submitted" ? "bg-sky-100 text-sky-700" :
                                product.status === "delisted" || !product.isActive ? "bg-rose-100 text-rose-700" :
                                product.status === "rejected" ? "bg-red-100 text-red-700" :
                                "bg-slate-100 text-slate-600"
                              ].join(" ")}>
                                {product.status === "approved" && product.isActive ? "Live" :
                                 !product.isActive ? "Inactive" : product.status}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
                      <div className="text-sm font-bold text-slate-900">Top product performance</div>
                      <div className="mt-3 space-y-3">
                        {seller.topProducts.length === 0 ? (
                          <div className="text-sm text-slate-500">No sales recorded yet for this seller.</div>
                        ) : (
                          seller.topProducts.map((product, index) => (
                            <div key={`${seller.id}-${product.productId}-${index}`} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900">
                                  {product.name}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {product.unitsSold} sold
                                </div>
                              </div>
                              <div className="text-right text-sm font-bold text-slate-900">
                                {moneyCompact(product.revenueCents)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-slate-200 bg-white/80 p-4">
                      <div className="text-sm font-bold text-slate-900">Stock alerts</div>
                      <div className="mt-3 space-y-3">
                        {seller.stockAlerts.length === 0 ? (
                          <div className="text-sm text-slate-500">No low-stock or out-of-stock products right now.</div>
                        ) : (
                          seller.stockAlerts.map((alert) => (
                            <div key={`${seller.id}-${alert.id}`} className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900">
                                  {alert.name}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {alert.level === "out" ? "Out of stock" : "Low stock"}
                                </div>
                              </div>
                              <span
                                className={[
                                  "rounded-full px-2.5 py-1 text-[11px] font-bold",
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
                    </div>
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

function MetricCard({
  label,
  value,
  sub,
  tone = "slate",
  compact = false,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "slate" | "emerald" | "amber" | "rose" | "sky";
  compact?: boolean;
}) {
  const tones: Record<string, string> = {
    slate: "text-slate-900 bg-white/70 border-slate-200",
    emerald: "text-emerald-900 bg-emerald-50 border-emerald-200",
    amber: "text-amber-900 bg-amber-50 border-amber-200",
    rose: "text-rose-900 bg-rose-50 border-rose-200",
    sky: "text-sky-900 bg-sky-50 border-sky-200",
  };

  return (
    <div className={["rounded-[22px] border p-4", tones[tone]].join(" ")}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className={compact ? "mt-2 text-2xl font-bold" : "mt-2 text-3xl font-bold"}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}
