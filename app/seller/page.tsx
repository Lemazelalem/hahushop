// app/seller/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Bell,
  Package,
  Plus,
  Home,
  Wallet,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  TrendingUp,
  DollarSign,
  Calendar,
  ChevronRight,
  ChevronDown,
  Box,
  FileText,
  Settings,
  LogOut,
  Search,
  Filter,
  MoreHorizontal,
  ArrowUpRight,
  Store,
  Edit3,
  Save,
  X,
  ShoppingBag,
  Send,
} from "lucide-react";

type ProductStatus = "draft" | "submitted" | "approved" | "rejected" | "archived";

type ProductRow = {
  id: string;
  name: string;
  emoji: string | null;
  image_url: string | null;
  status: ProductStatus;
  created_at: string;
  seller_price_cents: number | null;
  final_price_cents: number | null;
  stock_quantity?: number | null;
  size_variants?: Array<{ id: string; label: string; stock: number; priceAdjustCents?: number }> | null;
  category?: string;
};

type SellerDocumentStatus = "pending" | "approved" | "rejected";

type SellerVerificationInfo = {
  status: SellerDocumentStatus | "none";
  document_type: string | null;
  admin_notes: string | null;
  created_at: string | null;
  reviewed_at: string | null;
};


type PayoutTotals = {
  totalRecordedCents: number;
  totalPaidCents: number;
  totalPendingCents: number;
  lastPayoutAt: string | null;
};

type ActivityItem = {
  id: string;
  type: 'product' | 'payout' | 'verification';
  message: string;
  time: string;
  status?: string;
};

type NotifItem = {
  id: string;
  type: "order" | "product_approved" | "product_rejected" | "stock_low" | "stock_out";
  message: string;
  time: string;
  read: boolean;
};

type SoldItem = {
  id: string;
  product_id: string;
  name_snapshot: string;
  image_url_snapshot: string | null;
  emoji_snapshot: string | null;
  quantity: number;
  line_total_cents: number | null;
  order_id: string;
  order_created_at: string;
  order_status: string;
  order_payment_status: string;
};

type SellerOrder = {
  order_id: string;
  order_created_at: string;
  order_status: string;
  order_payment_status: string;
  shipping_full_name: string;
  shipping_phone: string;
  shipping_city: string;
  shipping_region: string;
  items: {
    id: string;
    name_snapshot: string;
    emoji_snapshot: string | null;
    image_url_snapshot: string | null;
    quantity: number;
    line_total_cents: number | null;
    color_name: string | null;
    size_label: string | null;
  }[];
  seller_total_cents: number;
};

type SalesByDay = {
  dateKey: string;
  label: string;
  units: number;
};

type SellerStockRow = {
  productId: string;
  productName: string;
  soldToday: number;
  liveStock: number | null;
  level: "ok" | "low" | "out" | "unknown";
};

type PayoutBankForm = {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  branch: string;
  notes: string;
};

type SellerProfileForm = {
  displayName: string;
  fullName: string;
  phone: string;
  email: string;
  addressLine1: string;
  city: string;
  subcity: string;
  notes: string;
};

export default function SellerDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [createdBanner, setCreatedBanner] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatus | "all">("all");
  const [showEarnings, setShowEarnings] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showQuickLinks, setShowQuickLinks] = useState(false);
  const [showSales, setShowSales] = useState(false);
  const [showStock, setShowStock] = useState(false);
  const [showAllStockRows, setShowAllStockRows] = useState(false);
  
  const [verification, setVerification] = useState<SellerVerificationInfo>({
    status: "none",
    document_type: null,
    admin_notes: null,
    created_at: null,
    reviewed_at: null,
  });

  const [payoutTotals, setPayoutTotals] = useState<PayoutTotals>({
    totalRecordedCents: 0,
    totalPaidCents: 0,
    totalPendingCents: 0,
    lastPayoutAt: null,
  });

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [sellerOrders, setSellerOrders] = useState<SellerOrder[]>([]);
  const [showOrders, setShowOrders] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "orders" | "stock" | "more">("home");
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [soldItems, setSoldItems] = useState<SoldItem[]>([]);
  const [salesByDay, setSalesByDay] = useState<SalesByDay[]>([]);
  const [soldTodayTotal, setSoldTodayTotal] = useState(0);
  const [soldByProductToday, setSoldByProductToday] = useState<Record<string, number>>({});
  const [liveStockDeltaByProduct, setLiveStockDeltaByProduct] = useState<Record<string, number>>({});
  const [newSaleCount, setNewSaleCount] = useState(0);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankSaveMsg, setBankSaveMsg] = useState<string | null>(null);
  const [showBankBannerForm, setShowBankBannerForm] = useState(false);
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoSaveMsg, setInfoSaveMsg] = useState<string | null>(null);
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [stockDraft, setStockDraft] = useState<{
    simpleQty: string;
    variants: Array<{ id: string; label: string; stock: string }>;
  } | null>(null);
  const [stockSaving, setStockSaving] = useState(false);
  const [stockSaveMsg, setStockSaveMsg] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState<PayoutBankForm>({
    bankName: "",
    accountHolder: "",
    accountNumber: "",
    branch: "",
    notes: "",
  });
  const [profileForm, setProfileForm] = useState<SellerProfileForm>({
    displayName: "",
    fullName: "",
    phone: "",
    email: "",
    addressLine1: "",
    city: "",
    subcity: "",
    notes: "",
  });

  const handleStartEditStock = (productId: string) => {
    const p = products.find((pr) => pr.id === productId);
    if (!p) return;
    const isVariant = Array.isArray(p.size_variants) && p.size_variants.length > 0;
    setEditingStockId(productId);
    setStockSaveMsg(null);
    setStockDraft({
      simpleQty: isVariant ? "" : String(p.stock_quantity ?? 0),
      variants: isVariant
        ? p.size_variants!.map((v) => ({ id: v.id, label: v.label, stock: String(v.stock ?? 0) }))
        : [],
    });
  };

  const handleSaveStock = async (productId: string) => {
    const p = products.find((pr) => pr.id === productId);
    if (!p || !stockDraft) return;
    setStockSaving(true);
    setStockSaveMsg(null);
    const isVariant = stockDraft.variants.length > 0;

    if (isVariant) {
      const updatedVariants = p.size_variants!.map((v) => {
        const d = stockDraft.variants.find((dv) => dv.id === v.id);
        return d ? { ...v, stock: Math.max(0, parseInt(d.stock) || 0) } : v;
      });
      const totalQty = updatedVariants.reduce((s, v) => s + v.stock, 0);
      const { error } = await supabase
        .from("products")
        .update({ size_variants: updatedVariants, stock_quantity: totalQty })
        .eq("id", productId);
      if (error) {
        setStockSaveMsg("Error: " + error.message);
      } else {
        setProducts((prev) =>
          prev.map((pr) =>
            pr.id === productId ? { ...pr, size_variants: updatedVariants, stock_quantity: totalQty } : pr
          )
        );
        // Clear live delta — the new saved value is the ground truth
        setLiveStockDeltaByProduct((prev) => { const n = { ...prev }; delete n[productId]; return n; });
        setStockSaveMsg("Saved!");
        setTimeout(() => { setEditingStockId(null); setStockSaveMsg(null); }, 900);
      }
    } else {
      const newQty = Math.max(0, parseInt(stockDraft.simpleQty) || 0);
      const { error } = await supabase
        .from("products")
        .update({ stock_quantity: newQty })
        .eq("id", productId);
      if (error) {
        setStockSaveMsg("Error: " + error.message);
      } else {
        setProducts((prev) =>
          prev.map((pr) => pr.id === productId ? { ...pr, stock_quantity: newQty } : pr)
        );
        // Clear live delta — the new saved value is the ground truth
        setLiveStockDeltaByProduct((prev) => { const n = { ...prev }; delete n[productId]; return n; });
        setStockSaveMsg("Saved!");
        setTimeout(() => { setEditingStockId(null); setStockSaveMsg(null); }, 900);
      }
    }
    setStockSaving(false);
  };

  // Parses raw items from /api/seller/orders and updates all derived state.
  // Called on initial load AND after real-time events to keep data fresh.
  const applyOrdersData = useCallback((rawItems: any[]) => {
    // Build sellerOrders map
    const orderMap = new Map<string, SellerOrder>();
    for (const item of rawItems) {
      const o = item.orders;
      if (!o || o.status === "cancelled") continue;
      if (!orderMap.has(item.order_id)) {
        orderMap.set(item.order_id, {
          order_id: item.order_id,
          order_created_at: o.created_at,
          order_status: o.status,
          order_payment_status: o.payment_status,
          shipping_full_name: o.shipping_full_name ?? "",
          shipping_phone: o.shipping_phone ?? "",
          shipping_city: o.shipping_city ?? "",
          shipping_region: o.shipping_region ?? "",
          items: [],
          seller_total_cents: 0,
        });
      }
      const entry = orderMap.get(item.order_id)!;
      entry.items.push({
        id: item.id,
        name_snapshot: item.name_snapshot,
        emoji_snapshot: item.emoji_snapshot,
        image_url_snapshot: item.image_url_snapshot,
        quantity: item.quantity,
        line_total_cents: item.line_total_cents,
        color_name: item.color_name,
        size_label: item.size_label,
      });
      entry.seller_total_cents += item.line_total_cents ?? 0;
    }
    setSellerOrders(
      Array.from(orderMap.values()).sort(
        (a, b) => new Date(b.order_created_at).getTime() - new Date(a.order_created_at).getTime()
      )
    );

    // Build sold items (no slice — show all)
    const mapped: SoldItem[] = rawItems
      .filter((item) => item.orders?.status !== "cancelled")
      .map((item) => ({
        id: item.id,
        product_id: item.product_id ?? "",
        name_snapshot: item.name_snapshot,
        image_url_snapshot: item.image_url_snapshot,
        emoji_snapshot: item.emoji_snapshot,
        quantity: item.quantity,
        line_total_cents: item.line_total_cents,
        order_id: item.order_id,
        order_created_at: item.orders?.created_at ?? new Date().toISOString(),
        order_status: item.orders?.status ?? "unknown",
        order_payment_status: item.orders?.payment_status ?? "unknown",
      }));

    setSoldItems(mapped.slice(0, 50));

    // Compute daily & per-product stats from ALL items (not sliced).
    // Use local date (seller's timezone) so "today" matches their clock,
    // not UTC — important for Ethiopia (UTC+3) where UTC midnight lags 3 hours.
    const localDate = (iso: string) =>
      new Date(iso).toLocaleDateString("en-CA"); // "YYYY-MM-DD" in local tz
    const todayKey = new Date().toLocaleDateString("en-CA");
    const byProductToday: Record<string, number> = {};
    const byDay: Record<string, number> = {};

    for (const s of mapped) {
      const day = localDate(s.order_created_at);
      const qty = Math.max(0, Number(s.quantity ?? 0));
      byDay[day] = (byDay[day] ?? 0) + qty;
      if (day === todayKey && s.product_id) {
        byProductToday[s.product_id] = (byProductToday[s.product_id] ?? 0) + qty;
      }
    }

    const dailyRows: SalesByDay[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-CA");
      dailyRows.push({
        dateKey: key,
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        units: byDay[key] ?? 0,
      });
    }

    setSalesByDay(dailyRows);
    setSoldByProductToday(byProductToday);
    setSoldTodayTotal(byDay[todayKey] ?? 0);

    // Compute payout totals from seller_price_cents × qty.
    // seller_price_cents is what the seller earns — excludes admin markup.
    // Split by order payment_status: "paid" = collected, anything else = pending.
    let totalRecordedCents = 0;
    let totalPaidCents = 0;
    let lastPaidAt: string | null = null;

    for (const item of rawItems) {
      if (item.orders?.status === "cancelled") continue;
      const sellerCents =
        (item.seller_price_cents ?? 0) * Math.max(0, Number(item.quantity ?? 0));
      if (sellerCents <= 0) continue;
      totalRecordedCents += sellerCents;
      if (item.orders?.payment_status === "paid") {
        totalPaidCents += sellerCents;
        const at = item.orders?.created_at ?? null;
        if (at && (!lastPaidAt || at > lastPaidAt)) lastPaidAt = at;
      }
    }

    setPayoutTotals({
      totalRecordedCents,
      totalPaidCents,
      totalPendingCents: Math.max(totalRecordedCents - totalPaidCents, 0),
      lastPayoutAt: lastPaidAt,
    });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError(null);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData?.user;

      if (userError || !user) {
        setPageError("You must be logged in as a seller.");
        setLoading(false);
        return;
      }

      setSignedInAs(user.id);
      setProfileForm((prev) => ({
        ...prev,
        email: user.email ?? "",
        addressLine1: String(user.user_metadata?.seller_address_line1 ?? ""),
        city: String(user.user_metadata?.seller_city ?? ""),
        subcity: String(user.user_metadata?.seller_subcity ?? ""),
        notes: String(user.user_metadata?.seller_contact_notes ?? ""),
      }));
      setBankForm({
        bankName: String(user.user_metadata?.payout_bank_name ?? ""),
        accountHolder: String(user.user_metadata?.payout_account_holder ?? ""),
        accountNumber: String(user.user_metadata?.payout_account_number ?? ""),
        branch: String(user.user_metadata?.payout_bank_branch ?? ""),
        notes: String(user.user_metadata?.payout_bank_notes ?? ""),
      });

      // Check role
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, display_name, full_name, phone")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError || !profile || profile.role !== "seller") {
        setPageError("Not authorized. This area is for sellers only.");
        setLoading(false);
        return;
      }

      setProfileForm((prev) => ({
        ...prev,
        displayName: profile.display_name ?? "",
        fullName: profile.full_name ?? "",
        phone: profile.phone ?? "",
      }));

      // Load products
      const { data: rows, error } = await supabase
        .from("products")
        .select("*")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProducts((rows || []) as ProductRow[]);

      // Load verification
      const { data: docs } = await supabase
        .from("seller_documents")
        .select("*")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (docs && docs.length > 0) {
        const latest = docs[0];
        setVerification({
          status: ["pending", "approved", "rejected"].includes(latest.status) 
            ? latest.status 
            : "none",
          document_type: latest.document_type,
          admin_notes: latest.admin_notes,
          created_at: latest.created_at,
          reviewed_at: latest.reviewed_at,
        });
      }

      // Fetch orders — drives both order display and payout totals (via applyOrdersData).
      // seller_price_cents is returned per item; applyOrdersData computes payoutTotals from it.
      try {
        const ordersRes = await fetch("/api/seller/orders");
        if (ordersRes.ok) {
          const { items: rawItems } = await ordersRes.json();
          if (Array.isArray(rawItems)) {
            applyOrdersData(rawItems);
          }
        }
      } catch (e) {
        console.warn("Failed to load seller orders:", e);
      }

      // Generate activities from recent products
      const recentActivities: ActivityItem[] = [];
      (rows || []).slice(0, 5).forEach((p: ProductRow) => {
        recentActivities.push({
          id: p.id,
          type: 'product',
          message: `Product "${p.name}" ${p.status}`,
          time: p.created_at,
          status: p.status,
        });
      });
      setActivities(recentActivities.slice(0, 5));

      // Build notifications from product statuses
      const productNotifs: NotifItem[] = [];
      (rows || []).forEach((p: ProductRow) => {
        if (p.status === "approved") {
          productNotifs.push({
            id: `approved-${p.id}`,
            type: "product_approved",
            message: `"${p.name}" was approved and is now live`,
            time: p.created_at,
            read: false,
          });
        } else if (p.status === "rejected") {
          productNotifs.push({
            id: `rejected-${p.id}`,
            type: "product_rejected",
            message: `"${p.name}" was rejected — tap to fix and resubmit`,
            time: p.created_at,
            read: false,
          });
        }
      });
      // Newest first, cap at 30
      productNotifs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setNotifications((prev) => {
        // Merge with existing order notifications (added by real-time handler)
        const orderNotifs = prev.filter((n) => n.type === "order");
        const merged = [...orderNotifs, ...productNotifs].slice(0, 30);
        merged.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        return merged;
      });

    } catch (err: any) {
      console.error(err);
      setPageError(err.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore last active tab when returning from a sub-page (product edit, verification, etc.)
  useEffect(() => {
    const saved = sessionStorage.getItem("sellerActiveTab");
    if (saved) setActiveTab(saved as any);
  }, []);

  // Handle ?success=product_created redirect — show banner & switch to More tab
  useEffect(() => {
    if (searchParams.get("success") === "product_created") {
      setCreatedBanner(true);
      setActiveTab("more");
      setStatusFilter("draft");
      sessionStorage.setItem("sellerActiveTab", "more");
      // clean up URL
      window.history.replaceState(null, "", "/seller");
      setTimeout(() => setCreatedBanner(false), 6000);
    }
  }, [searchParams]);

  const draftProducts = useMemo(
    () => products.filter((p) => p.status === "draft"),
    [products]
  );

  const switchTab = (tab: "home" | "orders" | "stock" | "more") => {
    setActiveTab(tab);
    sessionStorage.setItem("sellerActiveTab", tab);
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!signedInAs) return;

    const channel = supabase
      .channel(`seller-sales-${signedInAs}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_items",
          filter: `seller_id=eq.${signedInAs}`,
        },
        (payload) => {
          const item = payload.new as any;
          const qty = Math.max(0, Number(item.quantity ?? 0));

          // Immediate optimistic updates (instant UI feedback)
          setLiveStockDeltaByProduct((prev) => ({
            ...prev,
            [item.product_id]: (prev[item.product_id] ?? 0) + qty,
          }));
          setSoldTodayTotal((prev) => prev + qty);
          setSoldByProductToday((prev) => ({
            ...prev,
            [item.product_id]: (prev[item.product_id] ?? 0) + qty,
          }));
          setSalesByDay((prev) => {
            if (prev.length === 0) return prev;
            const copy = [...prev];
            copy[copy.length - 1] = { ...copy[copy.length - 1], units: copy[copy.length - 1].units + qty };
            return copy;
          });
          setNewSaleCount((prev) => prev + 1);

          // Add new-order notification
          const notifId = `order-${item.order_id ?? Date.now()}`;
          setNotifications((prev) => {
            if (prev.find((n) => n.id === notifId)) return prev;
            const newNotif: NotifItem = {
              id: notifId,
              type: "order",
              message: `New order: ${qty} × "${item.name_snapshot ?? "product"}"`,
              time: new Date().toISOString(),
              read: false,
            };
            return [newNotif, ...prev].slice(0, 30);
          });

          // Server refetch to sync all order + sold data authoritatively
          fetch("/api/seller/orders")
            .then((r) => r.ok ? r.json() : null)
            .then((data) => { if (data?.items) applyOrdersData(data.items); })
            .catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [signedInAs]);

  const stats = useMemo(() => {
    const base = { total: 0, draft: 0, submitted: 0, approved: 0, rejected: 0, archived: 0 };
    products.forEach(p => {
      base.total++;
      base[p.status]++;
    });
    return base;
  }, [products]);

  const STATUS_ORDER: Record<ProductStatus, number> = {
    draft: 0, submitted: 1, rejected: 2, approved: 3, archived: 4,
  };

  const filteredProducts = useMemo(() => {
    return products
      .filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === "all" || p.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  }, [products, searchQuery, statusFilter]);

  const getProductStock = (product: ProductRow): number | null => {
    if (Array.isArray(product.size_variants) && product.size_variants.length > 0) {
      return product.size_variants.reduce(
        (sum, variant) => sum + Math.max(0, Number(variant?.stock ?? 0)),
        0
      );
    }
    if (typeof product.stock_quantity === "number") {
      return Math.max(0, Number(product.stock_quantity));
    }
    return null;
  };

  const stockRows = useMemo<SellerStockRow[]>(() => {
    return products
      .map((p) => {
        const baseStock = getProductStock(p);
        const decremented = liveStockDeltaByProduct[p.id] ?? 0;
        const liveStock = baseStock === null ? null : Math.max(0, baseStock - decremented);
        const soldToday = soldByProductToday[p.id] ?? 0;
        const level: "ok" | "low" | "out" | "unknown" =
          liveStock === null
            ? "unknown"
            : liveStock <= 0
            ? "out"
            : liveStock <= 5
            ? "low"
            : "ok";

        return {
          productId: p.id,
          productName: p.name,
          soldToday,
          liveStock,
          level,
        };
      })
      .sort((a, b) => {
        const rank = { out: 0, low: 1, ok: 2, unknown: 3 };
        return rank[a.level] - rank[b.level] || b.soldToday - a.soldToday;
      });
  }, [products, soldByProductToday, liveStockDeltaByProduct]);

  // Stock-level notifications — runs after stockRows is computed
  useEffect(() => {
    if (stockRows.length === 0) return;
    const stockNotifs: NotifItem[] = stockRows
      .filter((r) => r.level === "out" || r.level === "low")
      .map((r) => ({
        id: `stock-${r.productId}`,
        type: (r.level === "out" ? "stock_out" : "stock_low") as NotifItem["type"],
        message: r.level === "out"
          ? `"${r.productName}" is out of stock`
          : `"${r.productName}" is running low (${r.liveStock} left)`,
        time: new Date().toISOString(),
        read: false,
      }));
    if (stockNotifs.length === 0) return;
    setNotifications((prev) => {
      const without = prev.filter((n) => !n.id.startsWith("stock-"));
      const merged = [...stockNotifs, ...without].slice(0, 30);
      merged.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      return merged;
    });
  }, [stockRows]);

  const formatMoney = (cents: number | null | undefined) => {
    if (!cents && cents !== 0) return "—";
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatRelativeTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    return formatDate(date);
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { icon: any; color: string; bg: string; border: string }> = {
      approved: { 
        icon: CheckCircle2, 
        color: "text-emerald-700", 
        bg: "bg-emerald-50/80", 
        border: "border-emerald-200/80" 
      },
      submitted: { 
        icon: Clock, 
        color: "text-sky-700", 
        bg: "bg-sky-50/80", 
        border: "border-sky-200/80" 
      },
      rejected: { 
        icon: XCircle, 
        color: "text-rose-700", 
        bg: "bg-rose-50/80", 
        border: "border-rose-200/80" 
      },
      draft: { 
        icon: Box, 
        color: "text-slate-700", 
        bg: "bg-slate-50/80", 
        border: "border-slate-200/80" 
      },
      archived: { 
        icon: Package, 
        color: "text-amber-700", 
        bg: "bg-amber-50/80", 
        border: "border-amber-200/80" 
      },
    };
    return configs[status] || configs.draft;
  };

  const saveBankInfo = async () => {
    setBankSaving(true);
    setBankSaveMsg(null);

    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          payout_bank_name: bankForm.bankName.trim() || null,
          payout_account_holder: bankForm.accountHolder.trim() || null,
          payout_account_number: bankForm.accountNumber.trim() || null,
          payout_bank_branch: bankForm.branch.trim() || null,
          payout_bank_notes: bankForm.notes.trim() || null,
        },
      });

      if (error) throw error;
      setBankSaveMsg("Bank details saved.");
      setShowBankBannerForm(false);
    } catch (err: any) {
      console.error(err);
      setBankSaveMsg(err?.message || "Failed to save bank details.");
    } finally {
      setBankSaving(false);
    }
  };

  const saveSellerInfo = async () => {
    setInfoSaving(true);
    setInfoSaveMsg(null);

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          display_name: profileForm.displayName.trim() || null,
          full_name: profileForm.fullName.trim() || null,
          phone: profileForm.phone.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", signedInAs);

      if (profileError) throw profileError;

      const { error: authError } = await supabase.auth.updateUser({
        data: {
          seller_address_line1: profileForm.addressLine1.trim() || null,
          seller_city: profileForm.city.trim() || null,
          seller_subcity: profileForm.subcity.trim() || null,
          seller_contact_notes: profileForm.notes.trim() || null,
          payout_bank_name: bankForm.bankName.trim() || null,
          payout_account_holder: bankForm.accountHolder.trim() || null,
          payout_account_number: bankForm.accountNumber.trim() || null,
          payout_bank_branch: bankForm.branch.trim() || null,
          payout_bank_notes: bankForm.notes.trim() || null,
        },
      });

      if (authError) throw authError;
      setInfoSaveMsg("Seller information updated.");
    } catch (err: any) {
      console.error(err);
      setInfoSaveMsg(err?.message || "Failed to update seller information.");
    } finally {
      setInfoSaving(false);
    }
  };

  const hasBankInfo =
    bankForm.bankName.trim().length > 0 &&
    bankForm.accountHolder.trim().length > 0 &&
    bankForm.accountNumber.trim().length > 0;

  const renderVerificationCard = () => {
    const v = verification;
    
    if (v.status === "none") {
      return (
        <div className="glass-morphism rounded-2xl p-5 border-l-4 border-amber-400 bg-gradient-to-r from-amber-50/80 to-white/60">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-900">Complete Your Verification</h3>
              <p className="text-sm text-slate-600 mt-1">
                Upload your business documents to unlock full seller features and start selling.
              </p>
              <button
                onClick={() => router.push("/seller/verification")}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors shadow-md"
              >
                Start Verification
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (v.status === "pending") {
      return (
        <div className="glass-morphism rounded-2xl p-5 border-l-4 border-sky-400 bg-gradient-to-r from-sky-50/80 to-white/60">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
              <Clock className="w-6 h-6 text-sky-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-900">Verification In Review</h3>
              <p className="text-sm text-slate-600 mt-1">
                Your documents are being reviewed. You can still create products while waiting.
              </p>
              {v.created_at && (
                <p className="text-xs text-sky-600 mt-2">
                  Submitted {formatRelativeTime(v.created_at)}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (v.status === "rejected") {
      return (
        <div className="glass-morphism rounded-2xl p-5 border-l-4 border-rose-400 bg-gradient-to-r from-rose-50/80 to-white/60">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
              <XCircle className="w-6 h-6 text-rose-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-900">Verification Rejected</h3>
              <p className="text-sm text-slate-600 mt-1">
                Please review admin feedback and resubmit corrected documents.
              </p>
              {v.admin_notes && (
                <div className="mt-3 p-3 rounded-lg bg-white/80 border border-rose-200 text-sm text-rose-800">
                  <span className="font-semibold">Feedback: </span>
                  {v.admin_notes}
                </div>
              )}
              <button
                onClick={() => router.push("/seller/verification")}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 transition-colors shadow-md"
              >
                Resubmit Documents
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-lime-50/30 to-blue-50/30 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-slate-200/50 rounded-3xl" />
            <div className="grid grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-200/50 rounded-2xl" />)}
            </div>
            <div className="h-96 bg-slate-200/50 rounded-3xl" />
          </div>
        </div>
      </main>
    );
  }

  if (pageError) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-lime-50/30 to-blue-50/30 p-4 md:p-6 flex items-center justify-center">
        <div className="glass-card rounded-3xl p-8 text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Access Error</h2>
          <p className="text-slate-600 mb-6">{pageError}</p>
          <button
            onClick={() => router.push("/login")}
            className="px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-lime-50/30 to-blue-50/30">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 glass-morphism border-b border-slate-200/40 px-4 md:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-lime-400 to-blue-500 flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900">Seller Dashboard · የሻጭ ዳሽቦርድ</h1>
              <p className="text-xs text-slate-500">Manage your store</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/")}
              className="p-2 rounded-lg hover:bg-slate-100/80 transition-colors"
              title="Home"
            >
              <Home className="w-5 h-5 text-slate-600" />
            </button>
            <button
              onClick={() => setShowNotifPanel((v) => !v)}
              className="relative p-2 rounded-lg hover:bg-slate-100/80 transition-colors"
              title="Notifications"
            >
              <Bell className={`w-5 h-5 ${notifications.some((n) => !n.read) ? "text-indigo-600" : "text-slate-600"}`} />
              {notifications.some((n) => !n.read) && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {notifications.filter((n) => !n.read).length > 9 ? "9+" : notifications.filter((n) => !n.read).length}
                </span>
              )}
            </button>
            <button
              onClick={() => router.push("/seller/payouts")}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl hover:bg-slate-100/80 text-slate-700 font-medium transition-colors"
            >
              <Wallet className="w-4 h-4" />
              Payouts
            </button>
            <button
              onClick={() => router.push("/seller/products/new")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-lime-500 text-white font-semibold hover:bg-lime-600 transition-colors shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Product</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── NOTIFICATION PANEL ── */}
      {showNotifPanel && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
            onClick={() => setShowNotifPanel(false)}
          />
          {/* Panel */}
          <div className="fixed top-[68px] right-3 left-3 md:left-auto md:right-6 md:w-96 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden max-h-[70vh] flex flex-col">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-shrink-0">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-500" />
                Notifications
                {notifications.some((n) => !n.read) && (
                  <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 text-[9px] font-bold">
                    {notifications.filter((n) => !n.read).length} new
                  </span>
                )}
              </h3>
              <button
                onClick={() => {
                  setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                  setNewSaleCount(0);
                }}
                className="text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors"
              >
                Mark all read
              </button>
            </div>
            {/* Notification list */}
            <div className="overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No notifications yet</p>
                </div>
              ) : (
                notifications.map((notif) => {
                  const icons: Record<NotifItem["type"], string> = {
                    order: "🛒",
                    product_approved: "✅",
                    product_rejected: "❌",
                    stock_low: "⚠️",
                    stock_out: "🚫",
                  };
                  const colors: Record<NotifItem["type"], string> = {
                    order: "bg-indigo-50 border-indigo-100",
                    product_approved: "bg-emerald-50 border-emerald-100",
                    product_rejected: "bg-rose-50 border-rose-100",
                    stock_low: "bg-amber-50 border-amber-100",
                    stock_out: "bg-rose-50 border-rose-100",
                  };
                  return (
                    <div
                      key={notif.id}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 ${notif.read ? "opacity-60" : ""} ${colors[notif.type]}`}
                    >
                      <span className="text-base flex-shrink-0 mt-0.5">{icons[notif.type]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 leading-snug">{notif.message}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{formatRelativeTime(notif.time)}</p>
                      </div>
                      {!notif.read && (
                        <button
                          onClick={() => setNotifications((prev) =>
                            prev.map((n) => n.id === notif.id ? { ...n, read: true } : n)
                          )}
                          className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0 mt-1.5 hover:bg-slate-300 transition-colors"
                          title="Mark as read"
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* ── DESKTOP LAYOUT (md+) — unchanged ── */}
      <div className="hidden md:block max-w-7xl mx-auto p-6 space-y-6">

        {/* Product created success banner (desktop) */}
        {createdBanner && (
          <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/80 p-5 flex items-center gap-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-base font-bold text-emerald-800">Draft product created!</p>
              <p className="text-sm text-emerald-600 mt-0.5">Find it in "My Products" below, then click to review and submit for admin approval.</p>
            </div>
            <button onClick={() => setCreatedBanner(false)} className="text-emerald-400 hover:text-emerald-600 transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Welcome + Quick Stats (compact on mobile) */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg md:text-3xl font-bold text-slate-900">
                Welcome back! 👋
              </h2>
              <p className="text-slate-600 text-xs md:text-base mt-0.5">
                Here's what's happening with your store today.
              </p>
            </div>
            {/* Inline mini stats on mobile */}
            <div className="flex md:hidden gap-2">
              <div className="text-center px-3 py-1.5 rounded-xl bg-white/60 border border-slate-200/40">
                <span className="text-lg font-bold text-slate-900 block leading-tight">{stats.total}</span>
                <span className="text-[9px] text-slate-500">Products</span>
              </div>
              <div className="text-center px-3 py-1.5 rounded-xl bg-emerald-50/60 border border-emerald-200/40">
                <span className="text-lg font-bold text-emerald-700 block leading-tight">{stats.approved}</span>
                <span className="text-[9px] text-emerald-600">Live</span>
              </div>
              <div className="text-center px-3 py-1.5 rounded-xl bg-sky-50/60 border border-sky-200/40">
                <span className="text-lg font-bold text-sky-700 block leading-tight">{stats.submitted}</span>
                <span className="text-[9px] text-sky-600">Pending</span>
              </div>
            </div>
          </div>

          {renderVerificationCard()}

          {/* Desktop Performance Card */}
          <div className="hidden md:grid grid-cols-3 gap-6">
            <div className="glass-morphism rounded-2xl p-5 space-y-4 col-span-1">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-lime-600" />
                Performance
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-white/60">
                  <span className="text-sm text-slate-600">Total Products</span>
                  <span className="text-xl font-bold text-slate-900">{stats.total}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/60">
                  <span className="text-sm text-emerald-700">Approved</span>
                  <span className="text-xl font-bold text-emerald-700">{stats.approved}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-sky-50/60">
                  <span className="text-sm text-sky-700">Pending Review</span>
                  <span className="text-xl font-bold text-sky-700">{stats.submitted}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Earnings Overview — collapsible on mobile */}
        <section>
          <button
            onClick={() => setShowEarnings(!showEarnings)}
            className="md:hidden w-full flex items-center justify-between glass-morphism rounded-2xl p-4 mb-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-left">
                <span className="font-bold text-slate-900 text-sm">Earnings</span>
                <span className="block text-xs text-slate-500">Pending {formatMoney(payoutTotals.totalPendingCents)}</span>
              </div>
            </div>
            <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${showEarnings ? 'rotate-180' : ''}`} />
          </button>

          <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${showEarnings ? '' : 'hidden md:grid'}`}>
            <div className="glass-morphism rounded-2xl p-5 border-l-4 border-amber-400">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Pending Payout  ቀሪ ክፍያ</p>
                  <p className="text-2xl font-bold text-amber-900 mt-1">{formatMoney(payoutTotals.totalPendingCents)}</p>
                  <p className="text-xs text-amber-600 mt-1">Awaiting payment</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-amber-600" />
                </div>
              </div>
            </div>

            <div className="glass-morphism rounded-2xl p-5 border-l-4 border-emerald-400">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Total Earned</p>
                  <p className="text-2xl font-bold text-emerald-900 mt-1">{formatMoney(payoutTotals.totalPaidCents)}</p>
                  <p className="text-xs text-emerald-600 mt-1">Lifetime earnings</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
            </div>

            <div className="glass-morphism rounded-2xl p-5 border-l-4 border-blue-400">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Next Payout</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">
                    {payoutTotals.lastPayoutAt ? formatRelativeTime(payoutTotals.lastPayoutAt) : "—"}
                  </p>
                  <p className="text-xs text-blue-600 mt-1">Last payment received</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Daily Sales + Stock Watch */}
        <section className="glass-card rounded-2xl p-5 md:p-6">
          <button
            onClick={() => setShowStock(!showStock)}
            className="w-full flex items-center justify-between"
          >
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Box className="w-4 h-4 text-emerald-600" />
              Daily Sales &amp; Stock
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                {soldTodayTotal} sold today
              </span>
            </h3>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showStock ? "rotate-180" : ""}`} />
          </button>

          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-5 ${showStock ? "mt-3" : "hidden"}`}>
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Last 7 Days</div>
              <div className="grid grid-cols-7 gap-2">
                {salesByDay.map((d) => {
                  const h = Math.max(8, Math.min(80, d.units * 8));
                  return (
                    <div key={d.dateKey} className="flex flex-col items-center gap-1">
                      <div className="text-[10px] font-semibold text-slate-600">{d.units}</div>
                      <div
                        className="w-6 rounded-md bg-gradient-to-t from-lime-500 to-emerald-300"
                        style={{ height: `${h}px` }}
                        title={`${d.label}: ${d.units} units`}
                      />
                      <div className="text-[10px] text-slate-500">{d.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Stock — Products
                  {stockRows.length > 3 && (
                    <span className="ml-1.5 text-slate-400 font-normal normal-case">
                      ({showAllStockRows ? stockRows.length : Math.min(3, stockRows.length)} of {stockRows.length})
                    </span>
                  )}
                </div>
                {stockRows.length > 3 && (
                  <button
                    onClick={() => setShowAllStockRows((v) => !v)}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
                  >
                    {showAllStockRows ? "Show less" : `Show all ${stockRows.length}`}
                  </button>
                )}
              </div>
              {stockRows.length === 0 ? (
                <p className="text-sm text-slate-500">No stock data yet.</p>
              ) : (
                <div className="space-y-2">
                  {(showAllStockRows ? stockRows : stockRows.slice(0, 3)).map((row) => {
                    const isEditing = editingStockId === row.productId;
                    const product = products.find((p) => p.id === row.productId);
                    const isVariant = Array.isArray(product?.size_variants) && (product?.size_variants?.length ?? 0) > 0;
                    return (
                      <div
                        key={row.productId}
                        className="rounded-xl border border-slate-200/70 bg-white overflow-hidden"
                      >
                        {/* Row header */}
                        <div className="flex items-center justify-between px-3 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 truncate">{row.productName}</p>
                            <p className="text-xs text-slate-500">Sold today: {row.soldToday}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-3">
                            <div className="text-right">
                              <p className={`text-sm font-bold ${
                                row.level === "out" ? "text-rose-700"
                                : row.level === "low" ? "text-amber-700"
                                : row.level === "unknown" ? "text-slate-500"
                                : "text-emerald-700"
                              }`}>
                                {row.liveStock === null ? "—" : `${row.liveStock} left`}
                              </p>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                                {row.level === "out" ? "Out" : row.level === "low" ? "Low" : row.level === "unknown" ? "Unknown" : "Healthy"}
                              </p>
                            </div>
                            <button
                              onClick={() => isEditing ? setEditingStockId(null) : handleStartEditStock(row.productId)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                              title={isEditing ? "Cancel" : "Edit stock"}
                            >
                              {isEditing ? <X className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        {/* Inline edit form */}
                        {isEditing && stockDraft && (
                          <div className="border-t border-slate-100 bg-slate-50 px-3 py-3">
                            {isVariant ? (
                              <div className="space-y-2">
                                {stockDraft.variants.map((v, i) => (
                                  <div key={v.id} className="flex items-center gap-2">
                                    <span className="text-xs text-slate-600 w-20 truncate">{v.label}</span>
                                    <input
                                      type="number"
                                      min="0"
                                      value={v.stock}
                                      onChange={(e) => setStockDraft((prev) => {
                                        if (!prev) return prev;
                                        const updated = [...prev.variants];
                                        updated[i] = { ...updated[i], stock: e.target.value };
                                        return { ...prev, variants: updated };
                                      })}
                                      className="w-20 text-sm border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                    />
                                    <span className="text-xs text-slate-400">units</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-600">Stock quantity</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={stockDraft.simpleQty}
                                  onChange={(e) => setStockDraft((prev) => prev ? { ...prev, simpleQty: e.target.value } : prev)}
                                  className="w-24 text-sm border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                />
                                <span className="text-xs text-slate-400">units</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-3">
                              <button
                                onClick={() => handleSaveStock(row.productId)}
                                disabled={stockSaving}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
                              >
                                <Save className="w-3 h-3" />
                                {stockSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => { setEditingStockId(null); setStockSaveMsg(null); }}
                                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-200 transition-colors"
                              >
                                Cancel
                              </button>
                              {stockSaveMsg && (
                                <span className={`text-xs font-medium ${stockSaveMsg.startsWith("Error") ? "text-rose-600" : "text-emerald-600"}`}>
                                  {stockSaveMsg}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Add Bank Banner when missing required bank info */}
        {!hasBankInfo && (
          <section className="glass-card rounded-2xl p-4 md:p-5 border border-amber-200/70 bg-gradient-to-r from-amber-50/70 to-white/80">
            <button
              onClick={() => setShowBankBannerForm((prev) => !prev)}
              className="w-full flex items-center justify-between gap-4 text-left"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Wallet className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Add your bank information</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Required before we can send Ethiopian bank payouts.
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-slate-500 transition-transform ${
                  showBankBannerForm ? "rotate-180" : ""
                }`}
              />
            </button>

            {showBankBannerForm && (
              <div className="mt-4 pt-4 border-t border-amber-200/70 grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Bank Name</span>
                  <input
                    type="text"
                    value={bankForm.bankName}
                    onChange={(e) =>
                      setBankForm((prev) => ({ ...prev, bankName: e.target.value }))
                    }
                    placeholder="Example: Commercial Bank of Ethiopia"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Account Holder Name</span>
                  <input
                    type="text"
                    value={bankForm.accountHolder}
                    onChange={(e) =>
                      setBankForm((prev) => ({ ...prev, accountHolder: e.target.value }))
                    }
                    placeholder="Name on bank account"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Account Number</span>
                  <input
                    type="text"
                    value={bankForm.accountNumber}
                    onChange={(e) =>
                      setBankForm((prev) => ({ ...prev, accountNumber: e.target.value }))
                    }
                    placeholder="Enter bank account number"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Branch (Optional)</span>
                  <input
                    type="text"
                    value={bankForm.branch}
                    onChange={(e) =>
                      setBankForm((prev) => ({ ...prev, branch: e.target.value }))
                    }
                    placeholder="Example: Bole Branch"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />
                </label>
                <div className="md:col-span-2 flex items-center gap-3">
                  <button
                    onClick={saveBankInfo}
                    disabled={bankSaving}
                    className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-lime-500 text-white font-semibold hover:bg-lime-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {bankSaving ? "Saving..." : "Save Bank Information"}
                  </button>
                  {bankSaveMsg && <p className="text-sm text-slate-600">{bankSaveMsg}</p>}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Edit Seller Information (includes bank details once added) */}
        {/* Draft products requiring submission (desktop) */}
        {draftProducts.length > 0 && (
          <section className="glass-card rounded-2xl p-4 md:p-5 border border-sky-200/70 bg-gradient-to-r from-sky-50/70 to-white/80">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-sky-700" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {draftProducts.length} draft{draftProducts.length > 1 ? "s" : ""} ready to submit
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Review and submit your drafts for admin approval to go live.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {draftProducts.slice(0, 5).map((product) => (
                <div
                  key={product.id}
                  className="group flex items-center gap-4 p-3 rounded-xl bg-white/60 hover:bg-white/80 border border-slate-200/40 hover:border-sky-300/50 transition-all cursor-pointer"
                  onClick={() => router.push(`/seller/products/${product.id}`)}
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl">{product.emoji || "📦"}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{product.name}</p>
                    <p className="text-xs text-slate-500">{formatRelativeTime(product.created_at)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 text-white text-xs font-bold group-hover:bg-sky-600 transition-colors">
                    <Send className="w-3.5 h-3.5" />
                    Review & Submit
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="glass-card rounded-2xl p-4 md:p-5">
          <button
            onClick={() => setShowEditInfo((prev) => !prev)}
            className="w-full flex items-center justify-between gap-4 text-left"
          >
            <div>
              <h3 className="text-base md:text-lg font-bold text-slate-900">Edit your information</h3>
              <p className="text-xs md:text-sm text-slate-600 mt-0.5">
                Contact, address, and payout profile for smooth settlements.
              </p>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-slate-500 transition-transform ${
                showEditInfo ? "rotate-180" : ""
              }`}
            />
          </button>

          {showEditInfo && (
            <div className="mt-4 pt-4 border-t border-slate-200/70 space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Contact Information</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Store Display Name</span>
                    <input
                      type="text"
                      value={profileForm.displayName}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, displayName: e.target.value }))
                      }
                      placeholder="What customers see"
                      className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Full Name</span>
                    <input
                      type="text"
                      value={profileForm.fullName}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))
                      }
                      placeholder="Legal name"
                      className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Phone</span>
                    <input
                      type="text"
                      value={profileForm.phone}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, phone: e.target.value }))
                      }
                      placeholder="+251..."
                      className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Email</span>
                    <input
                      type="email"
                      value={profileForm.email}
                      disabled
                      className="w-full rounded-xl border border-slate-200 bg-slate-100/90 px-3 py-2.5 text-sm text-slate-500"
                    />
                  </label>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Address Information</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Address Line</span>
                    <input
                      type="text"
                      value={profileForm.addressLine1}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, addressLine1: e.target.value }))
                      }
                      placeholder="Street, building, landmark"
                      className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">City</span>
                    <input
                      type="text"
                      value={profileForm.city}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, city: e.target.value }))
                      }
                      placeholder="Addis Ababa"
                      className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Subcity / Area</span>
                    <input
                      type="text"
                      value={profileForm.subcity}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, subcity: e.target.value }))
                      }
                      placeholder="Bole, Yeka, etc."
                      className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Contact Notes (Optional)</span>
                    <textarea
                      value={profileForm.notes}
                      onChange={(e) =>
                        setProfileForm((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      rows={2}
                      placeholder="Preferred call time, location hints, etc."
                      className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                    />
                  </label>
                </div>
              </div>

              {hasBankInfo && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">Payout Bank Information</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Bank Name</span>
                      <input
                        type="text"
                        value={bankForm.bankName}
                        onChange={(e) =>
                          setBankForm((prev) => ({ ...prev, bankName: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Account Holder</span>
                      <input
                        type="text"
                        value={bankForm.accountHolder}
                        onChange={(e) =>
                          setBankForm((prev) => ({ ...prev, accountHolder: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Account Number</span>
                      <input
                        type="text"
                        value={bankForm.accountNumber}
                        onChange={(e) =>
                          setBankForm((prev) => ({ ...prev, accountNumber: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Branch (Optional)</span>
                      <input
                        type="text"
                        value={bankForm.branch}
                        onChange={(e) =>
                          setBankForm((prev) => ({ ...prev, branch: e.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={saveSellerInfo}
                  disabled={infoSaving}
                  className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-lime-500 text-white font-semibold hover:bg-lime-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {infoSaving ? "Saving..." : "Save Information"}
                </button>
                {infoSaveMsg && <p className="text-sm text-slate-600">{infoSaveMsg}</p>}
              </div>
            </div>
          )}
        </section>

        {/* ── My Orders Section ── */}
        <section className="glass-card rounded-2xl p-4 sm:p-5">
          <button
            onClick={() => setShowOrders(!showOrders)}
            className="w-full flex items-center justify-between"
          >
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Store className="w-4 h-4 text-indigo-600" />
              My Orders
              {sellerOrders.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                  {sellerOrders.length}
                </span>
              )}
            </h3>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showOrders ? "rotate-180" : ""}`} />
          </button>

          <div className={`${showOrders ? "mt-3" : "hidden"}`}>
            {sellerOrders.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">
                No orders yet — they&apos;ll appear here when customers buy your products.
              </p>
            ) : (
              <div className="space-y-3">
                {sellerOrders.map((order) => {
                  const shortId = order.order_id.slice(0, 8).toUpperCase();
                  const isPaid = order.order_payment_status === "paid";
                  const isCancelled = order.order_status === "cancelled";
                  const totalQty = order.items.reduce((s, i) => s + Math.max(0, Number(i.quantity ?? 0)), 0);
                  const orderDt = new Date(order.order_created_at);
                  const dateStr = orderDt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  const timeStr = orderDt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={order.order_id} className="rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden">
                      {/* Order header */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-100">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-700">#{shortId}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isPaid ? "bg-emerald-100 text-emerald-700" :
                            isCancelled ? "bg-rose-100 text-rose-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>
                            {isPaid ? "✓ Paid" : isCancelled ? "Cancelled" : "⏳ Unpaid"}
                          </span>
                          {order.order_status && order.order_status !== "cancelled" && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                              {order.order_status}
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-slate-700">{totalQty} {totalQty === 1 ? "item" : "items"}</p>
                          <p className="text-[10px] text-slate-400">🕐 {dateStr} · {timeStr}</p>
                        </div>
                      </div>
                      {/* Items */}
                      <div className="divide-y divide-slate-100">
                        {order.items.map((item) => {
                          const variantParts = [item.color_name, item.size_label].filter(Boolean);
                          return (
                            <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center text-sm">
                                {item.image_url_snapshot
                                  ? <img src={item.image_url_snapshot} alt={item.name_snapshot} className="w-full h-full object-cover" />
                                  : item.emoji_snapshot ?? "📦"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800 truncate">{item.name_snapshot}</p>
                                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md">Qty {item.quantity}</span>
                                  {variantParts.map((v, i) => (
                                    <span key={i} className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md">{v}</span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Products Section */}
          <div className="lg:col-span-3 space-y-4">
            <div className="glass-card rounded-2xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <Package className="w-5 h-5 text-lime-600" />
                    My Products
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Manage and track your product listings
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/50 w-48"
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white/80 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/50"
                  >
                    <option value="all">All Status</option>
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              {/* Status Tabs */}
              <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {[
                  { key: 'all', label: 'All', count: stats.total, color: 'bg-slate-100 text-slate-700' },
                  { key: 'approved', label: 'Approved', count: stats.approved, color: 'bg-emerald-100 text-emerald-700' },
                  { key: 'submitted', label: 'Pending', count: stats.submitted, color: 'bg-sky-100 text-sky-700' },
                  { key: 'draft', label: 'Drafts', count: stats.draft, color: 'bg-slate-100 text-slate-700' },
                  { key: 'rejected', label: 'Rejected', count: stats.rejected, color: 'bg-rose-100 text-rose-700' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setStatusFilter(tab.key as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                      statusFilter === tab.key 
                        ? 'bg-slate-900 text-white shadow-md' 
                        : tab.color + ' hover:bg-opacity-80'
                    }`}
                  >
                    {tab.label}
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      statusFilter === tab.key ? 'bg-white/20' : 'bg-white/50'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {filteredProducts.length === 0 ? (
                <div className="text-center py-12 rounded-2xl bg-slate-50/50 border border-dashed border-slate-200">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                    <Package className="w-8 h-8 text-slate-400" />
                  </div>
                  <h4 className="font-bold text-slate-900 mb-1">No products found</h4>
                  <p className="text-sm text-slate-500 mb-4">
                    {searchQuery || statusFilter !== 'all' 
                      ? "Try adjusting your filters" 
                      : "Start by adding your first product"}
                  </p>
                  <button
                    onClick={() => router.push("/seller/products/new")}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-lime-500 text-white font-semibold hover:bg-lime-600 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Product
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredProducts.map((product) => {
                    const statusConfig = getStatusConfig(product.status);
                    const StatusIcon = statusConfig.icon;
                    
                    return (
                      <div
                        key={product.id}
                        className="group flex items-center gap-4 p-4 rounded-xl bg-white/60 hover:bg-white/80 border border-slate-200/40 hover:border-lime-300/50 transition-all cursor-pointer"
                        onClick={() => router.push(`/seller/products/${product.id}`)}
                      >
                        {/* Product Image */}
                        <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">
                              {product.emoji || "📦"}
                            </div>
                          )}
                        </div>

                        {/* Product Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-900 truncate text-sm sm:text-base">{product.name}</h4>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${statusConfig.bg} ${statusConfig.color} border ${statusConfig.border}`}>
                              <StatusIcon className="w-3 h-3" />
                              <span className="hidden sm:inline">{product.status}</span>
                            </span>
                          </div>
                          <div className="flex items-center gap-2 sm:gap-4 mt-0.5 sm:mt-1 text-xs sm:text-sm text-slate-500">
                            <span>{formatRelativeTime(product.created_at)}</span>
                            {/* Show price inline on mobile */}
                            <span className="sm:hidden font-semibold text-slate-900">{formatMoney(product.final_price_cents)}</span>
                            {product.category && (
                              <>
                                <span className="hidden sm:inline">•</span>
                                <span className="hidden sm:inline">{product.category}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Pricing — desktop only */}
                        <div className="text-right hidden sm:block">
                          <p className="font-bold text-slate-900">{formatMoney(product.final_price_cents)}</p>
                          <p className="text-xs text-slate-500">Your price: {formatMoney(product.seller_price_cents)}</p>
                        </div>

                        {/* Action */}
                        <div className="flex items-center gap-1 sm:gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/seller/products/${product.id}`);
                            }}
                            className="hidden sm:block p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <MoreHorizontal className="w-5 h-5" />
                          </button>
                          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-300 group-hover:text-lime-500 transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Recent Activity */}
            <div className="glass-card rounded-2xl p-4 sm:p-5">
              <button
                onClick={() => setShowActivity(!showActivity)}
                className="w-full flex items-center justify-between"
              >
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600" />
                  Recent Activity
                  {activities.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 text-[10px] font-bold">{activities.length}</span>
                  )}
                </h3>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showActivity ? 'rotate-180' : ''}`} />
              </button>
              <div className={`space-y-3 ${showActivity ? 'mt-3' : 'hidden'}`}>
                {activities.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">No recent activity</p>
                ) : (
                  activities.map((activity, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/50">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        activity.type === 'product' ? 'bg-lime-100 text-lime-600' :
                        activity.type === 'payout' ? 'bg-emerald-100 text-emerald-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>
                        {activity.type === 'product' ? <Package className="w-4 h-4" /> :
                         activity.type === 'payout' ? <DollarSign className="w-4 h-4" /> :
                         <CheckCircle2 className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{activity.message}</p>
                        <p className="text-xs text-slate-500">{formatRelativeTime(activity.time)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Links */}
            <div className="glass-card rounded-2xl p-4 sm:p-5">
              <button
                onClick={() => setShowQuickLinks(!showQuickLinks)}
                className="w-full flex items-center justify-between"
              >
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-400" />
                  Quick Links
                </h3>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showQuickLinks ? 'rotate-180' : ''}`} />
              </button>
              <div className={`space-y-2 ${showQuickLinks ? 'mt-3' : 'hidden'}`}>
                <button
                  onClick={() => router.push("/seller/verification")}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 text-left transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">Verification</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-lime-500" />
                </button>
                <button
                  onClick={() => router.push("/seller/payouts")}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 text-left transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Wallet className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">Payout History</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-lime-500" />
                </button>
                <button
                  onClick={() => router.push("/seller/settings")}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 text-left transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Settings className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">Settings</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-lime-500" />
                </button>
              </div>
            </div>

            {/* Recent Sales */}
            <div className="glass-card rounded-2xl p-4 sm:p-5">
              <button
                onClick={() => setShowSales(!showSales)}
                className="w-full flex items-center justify-between"
              >
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Recent Sales
                  {newSaleCount > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 text-[10px] font-bold">
                      {newSaleCount} new
                    </span>
                  )}
                </h3>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showSales ? 'rotate-180' : ''}`} />
              </button>

              <div className={`${showSales ? 'mt-3' : 'hidden'}`}>
              {soldItems.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">
                  No sales yet — they'll appear here in real time.
                </p>
              ) : (
                <div className="space-y-3">
                  {soldItems.slice(0, 5).map((sale) => (
                    <div
                      key={sale.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/50"
                    >
                      <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {sale.image_url_snapshot ? (
                          <img
                            src={sale.image_url_snapshot}
                            alt={sale.name_snapshot}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-lg">{sale.emoji_snapshot ?? "📦"}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {sale.name_snapshot}
                        </p>
                        <p className="text-xs text-slate-500">
                          Qty {sale.quantity} ·{" "}
                          {sale.line_total_cents
                            ? `ETB ${(sale.line_total_cents / 100).toFixed(0)}`
                            : "—"}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            sale.order_payment_status === "paid"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {sale.order_payment_status === "paid" ? "Paid" : "Pending"}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {formatRelativeTime(sale.order_created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MOBILE ORDER DETAIL OVERLAY ── */}
      {selectedOrderId && (() => {
        const order = sellerOrders.find((o) => o.order_id === selectedOrderId);
        if (!order) return null;
        const isPaid = order.order_payment_status === "paid";
        const isCancelled = order.order_status === "cancelled";
        const totalQty = order.items.reduce((s, i) => s + Math.max(0, Number(i.quantity ?? 0)), 0);
        const orderDt = new Date(order.order_created_at);
        const dateStr = orderDt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
        const timeStr = orderDt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        return (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm md:hidden"
              onClick={() => setSelectedOrderId(null)}
            />
            {/* Slide-up panel */}
            <div className="fixed inset-x-0 bottom-0 z-50 md:hidden bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden">
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-slate-200" />
              </div>
              {/* Header */}
              <div className="px-5 py-3 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-sm font-black text-slate-900">#{order.order_id.slice(0, 8).toUpperCase()}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        isPaid ? "bg-emerald-100 text-emerald-700" :
                        isCancelled ? "bg-rose-100 text-rose-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {isPaid ? "✓ Paid" : isCancelled ? "Cancelled" : "⏳ Unpaid"}
                      </span>
                      {order.order_status && order.order_status !== "cancelled" && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                          {order.order_status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">🕐 {dateStr} · {timeStr}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {order.items.length} product{order.items.length !== 1 ? "s" : ""} · {totalQty} unit{totalQty !== 1 ? "s" : ""} total
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedOrderId(null)}
                    className="p-2 rounded-xl bg-slate-100 text-slate-500 flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Items */}
              <div className="overflow-y-auto flex-1 px-5 py-3 space-y-3">
                {order.items.map((item, idx) => {
                  const variantParts = [item.color_name, item.size_label].filter(Boolean);
                  return (
                    <div key={item.id ?? idx} className="flex items-start gap-4 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      {/* Image */}
                      <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {item.image_url_snapshot
                          ? <img src={item.image_url_snapshot} alt={item.name_snapshot} className="w-full h-full object-cover" />
                          : <span className="text-2xl">{item.emoji_snapshot ?? "📦"}</span>}
                      </div>
                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 leading-snug">{item.name_snapshot}</p>
                        {/* Quantity */}
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg">
                            Qty&nbsp;{item.quantity}
                          </span>
                          {variantParts.map((v, i) => (
                            <span key={i} className="text-xs text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg font-medium">
                              {v}
                            </span>
                          ))}
                        </div>
                        {/* Notes if any */}
                        {!item.color_name && !item.size_label && (
                          <p className="text-[10px] text-slate-400 mt-1">No variants</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Footer */}
              <div className="px-5 py-4 border-t border-slate-100 flex-shrink-0 bg-slate-50">
                <p className="text-xs text-slate-500 text-center">
                  {isPaid ? "✅ Payment confirmed" : "⏳ Waiting for payment confirmation"}
                </p>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── MOBILE LAYOUT (below md) ── */}
      <div className="md:hidden pb-24">

        {/* ── Home Tab ── */}
        {activeTab === "home" && (
          <div className="p-4 space-y-4">
            {renderVerificationCard()}

            {/* Bank info missing alert */}
            {!hasBankInfo && (
              <div className="rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50/70 to-white/80 p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Wallet className="w-4.5 h-4.5 text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900">Add your bank information</p>
                    <p className="text-xs text-slate-500 mt-0.5">Required to receive Ethiopian bank payouts.</p>
                  </div>
                </div>
                <button
                  onClick={() => { switchTab("more"); setTimeout(() => setShowEditInfo(true), 150); }}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold active:scale-[0.98] transition-transform"
                >
                  <Wallet className="w-4 h-4" />
                  Add Bank Details
                </button>
              </div>
            )}

            {/* Draft products ready to submit */}
            {draftProducts.length > 0 && (
              <div className="rounded-2xl border border-sky-200/60 bg-gradient-to-r from-sky-50/70 to-white/80 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-sky-600" />
                    Drafts to Submit
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">{draftProducts.length}</span>
                  </h3>
                  <button
                    onClick={() => { switchTab("more"); setStatusFilter("draft"); }}
                    className="text-xs font-semibold text-sky-600"
                  >
                    View all →
                  </button>
                </div>
                <div className="space-y-2">
                  {draftProducts.slice(0, 3).map((product) => (
                    <div
                      key={product.id}
                      onClick={() => router.push(`/seller/products/${product.id}`)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border border-slate-200/40 active:bg-slate-50"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg">{product.emoji || "📦"}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{product.name}</p>
                        <p className="text-[10px] text-sky-600 font-semibold">Tap to review & submit for approval →</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Earnings row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-morphism rounded-2xl p-4 border-l-4 border-amber-400">
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Pending</p>
                <p className="text-xl font-black text-amber-900 mt-0.5">{formatMoney(payoutTotals.totalPendingCents)}</p>
                <p className="text-[10px] text-amber-600 mt-0.5">Awaiting payment</p>
              </div>
              <div className="glass-morphism rounded-2xl p-4 border-l-4 border-emerald-400">
                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Total Earned</p>
                <p className="text-xl font-black text-emerald-900 mt-0.5">{formatMoney(payoutTotals.totalPaidCents)}</p>
                <p className="text-[10px] text-emerald-600 mt-0.5">Lifetime</p>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-card rounded-xl p-3 text-center">
                <span className="text-2xl font-black text-slate-900 block">{stats.total}</span>
                <span className="text-[10px] text-slate-500">Products</span>
              </div>
              <div className="glass-card rounded-xl p-3 text-center">
                <span className="text-2xl font-black text-emerald-700 block">{stats.approved}</span>
                <span className="text-[10px] text-emerald-600">Live</span>
              </div>
              <div className="glass-card rounded-xl p-3 text-center">
                <span className="text-2xl font-black text-amber-700 block">{soldTodayTotal}</span>
                <span className="text-[10px] text-amber-600">Sold today</span>
              </div>
            </div>

            {/* Add Product CTA */}
            <button
              onClick={() => router.push("/seller/products/new")}
              className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-lime-500 to-emerald-500 text-white font-bold text-base shadow-lg active:scale-[0.98] transition-transform"
            >
              <Plus className="w-5 h-5" />
              List a New Product
            </button>

            {/* Recent orders mini preview */}
            {sellerOrders.length > 0 && (
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <ShoppingBag className="w-4 h-4 text-indigo-500" />
                    Recent Orders
                  </h3>
                  <button
                    onClick={() => switchTab("orders")}
                    className="text-xs font-semibold text-lime-600"
                  >
                    See all →
                  </button>
                </div>
                <div className="space-y-2">
                  {sellerOrders.slice(0, 3).map((order) => {
                    const isPaid = order.order_payment_status === "paid";
                    const shortId = order.order_id.slice(0, 8).toUpperCase();
                    const totalQty = order.items.reduce((s, i) => s + Math.max(0, Number(i.quantity ?? 0)), 0);
                    const orderDt = new Date(order.order_created_at);
                    const dateStr = orderDt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    const timeStr = orderDt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={order.order_id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-600">#{shortId}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isPaid ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {isPaid ? "Paid" : "Unpaid"}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-slate-700">{totalQty} {totalQty === 1 ? "item" : "items"}</p>
                          <p className="text-[9px] text-slate-400">{dateStr} · {timeStr}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Sales */}
            {soldItems.length > 0 && (
              <div className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-bold text-slate-900 text-sm">Recent Sales</h3>
                  {newSaleCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600 text-[9px] font-bold">{newSaleCount} new</span>
                  )}
                </div>
                <div className="space-y-2">
                  {soldItems.slice(0, 5).map((sale) => (
                    <div key={sale.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50/80">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {sale.image_url_snapshot
                          ? <img src={sale.image_url_snapshot} alt={sale.name_snapshot} className="w-full h-full object-cover" />
                          : <span className="text-base">{sale.emoji_snapshot ?? "📦"}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate">{sale.name_snapshot}</p>
                        <p className="text-[10px] text-slate-400">
                          Qty {sale.quantity} · {sale.line_total_cents ? `ETB ${(sale.line_total_cents / 100).toFixed(0)}` : "—"}
                        </p>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        sale.order_payment_status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {sale.order_payment_status === "paid" ? "Paid" : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Orders Tab ── */}
        {activeTab === "orders" && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="w-4 h-4 text-indigo-500" />
              <h2 className="font-bold text-slate-900">My Orders</h2>
              {sellerOrders.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">{sellerOrders.length}</span>
              )}
            </div>
            {sellerOrders.length === 0 ? (
              <div className="text-center py-16">
                <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No orders yet.</p>
                <p className="text-slate-400 text-xs mt-1">Orders appear here when customers buy your products.</p>
              </div>
            ) : (
              sellerOrders.map((order) => {
                const shortId = order.order_id.slice(0, 8).toUpperCase();
                const isPaid = order.order_payment_status === "paid";
                const isCancelled = order.order_status === "cancelled";
                const totalQty = order.items.reduce((s, i) => s + Math.max(0, Number(i.quantity ?? 0)), 0);
                const orderDt = new Date(order.order_created_at);
                const dateStr = orderDt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                const timeStr = orderDt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div
                    key={order.order_id}
                    className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm active:scale-[0.99] transition-transform cursor-pointer"
                    onClick={() => setSelectedOrderId(order.order_id)}
                  >
                    {/* Header */}
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black text-slate-800">#{shortId}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isPaid ? "bg-emerald-100 text-emerald-700" :
                            isCancelled ? "bg-rose-100 text-rose-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>
                            {isPaid ? "✓ Paid" : isCancelled ? "Cancelled" : "⏳ Unpaid"}
                          </span>
                          {order.order_status && order.order_status !== "cancelled" && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 capitalize">
                              {order.order_status}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                          {totalQty} {totalQty === 1 ? "item" : "items"}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        🕐 {dateStr} · {timeStr}
                      </p>
                    </div>

                    {/* Item preview (first 2 items) */}
                    <div className="divide-y divide-slate-50">
                      {order.items.slice(0, 2).map((item) => {
                        const variantParts = [item.color_name, item.size_label].filter(Boolean);
                        return (
                          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center text-sm">
                              {item.image_url_snapshot
                                ? <img src={item.image_url_snapshot} alt={item.name_snapshot} className="w-full h-full object-cover" />
                                : item.emoji_snapshot ?? "📦"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">{item.name_snapshot}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md">Qty {item.quantity}</span>
                                {variantParts.map((v, i) => (
                                  <span key={i} className="text-[10px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-md">{v}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Tap hint */}
                    <div className="px-4 py-2 border-t border-slate-50 bg-slate-50 flex items-center justify-between">
                      <p className="text-[10px] text-slate-400">
                        {order.items.length > 2 ? `+${order.items.length - 2} more item${order.items.length - 2 !== 1 ? "s" : ""}` : ""}
                      </p>
                      <p className="text-[10px] font-semibold text-indigo-500">Tap for full details →</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Stock Tab ── */}
        {activeTab === "stock" && (
          <div className="p-4 space-y-4">
            {/* 7-day chart */}
            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-lime-600" />
                <h2 className="font-bold text-slate-900 text-sm">Sales — Last 7 Days</h2>
                <span className="ml-auto px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                  {soldTodayTotal} today
                </span>
              </div>
              <div className="flex items-end gap-1.5 h-20">
                {salesByDay.map((d, idx) => {
                  const maxUnits = Math.max(...salesByDay.map((x) => x.units), 1);
                  const h = Math.max(6, Math.round((d.units / maxUnits) * 72));
                  const isToday = idx === salesByDay.length - 1;
                  return (
                    <div key={d.dateKey} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] font-semibold text-slate-500">{d.units || ""}</span>
                      <div
                        className={`w-full rounded-t-md ${isToday ? "bg-lime-500" : "bg-lime-200"}`}
                        style={{ height: `${h}px` }}
                      />
                      <span className="text-[9px] text-slate-400">{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stock watch */}
            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Box className="w-4 h-4 text-emerald-600" />
                <h2 className="font-bold text-slate-900 text-sm">Stock Watch</h2>
              </div>
              {stockRows.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center">No products yet.</p>
              ) : (
                <div className="space-y-2">
                  {stockRows.map((row) => {
                    const isEditing = editingStockId === row.productId;
                    const product = products.find((p) => p.id === row.productId);
                    const isVariant = Array.isArray(product?.size_variants) && (product?.size_variants?.length ?? 0) > 0;
                    return (
                      <div key={row.productId} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 truncate">{row.productName}</p>
                            <p className="text-[10px] text-slate-400">Sold today: {row.soldToday}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-2">
                            <div className="text-right">
                              <p className={`text-sm font-bold ${
                                row.level === "out" ? "text-rose-700" :
                                row.level === "low" ? "text-amber-700" :
                                row.level === "unknown" ? "text-slate-400" :
                                "text-emerald-700"
                              }`}>
                                {row.liveStock === null ? "—" : `${row.liveStock}`}
                              </p>
                              <p className="text-[9px] text-slate-400 uppercase">
                                {row.level === "out" ? "Out" : row.level === "low" ? "Low" : row.level === "unknown" ? "?" : "OK"}
                              </p>
                            </div>
                            <button
                              onClick={() => isEditing ? setEditingStockId(null) : handleStartEditStock(row.productId)}
                              className="p-1.5 rounded-lg bg-slate-100 text-slate-500 active:bg-slate-200"
                            >
                              {isEditing ? <X className="w-3.5 h-3.5" /> : <Edit3 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                        {isEditing && stockDraft && (
                          <div className="border-t border-slate-100 bg-slate-50 px-3 py-3">
                            {isVariant ? (
                              <div className="space-y-2">
                                {stockDraft.variants.map((v, i) => (
                                  <div key={v.id} className="flex items-center gap-2">
                                    <span className="text-xs text-slate-600 w-20 truncate">{v.label}</span>
                                    <input
                                      type="number" min="0" value={v.stock}
                                      onChange={(e) => setStockDraft((prev) => {
                                        if (!prev) return prev;
                                        const updated = [...prev.variants];
                                        updated[i] = { ...updated[i], stock: e.target.value };
                                        return { ...prev, variants: updated };
                                      })}
                                      className="w-20 text-sm border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-600">Stock</span>
                                <input
                                  type="number" min="0" value={stockDraft.simpleQty}
                                  onChange={(e) => setStockDraft((prev) => prev ? { ...prev, simpleQty: e.target.value } : prev)}
                                  className="w-24 text-sm border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                />
                                <span className="text-xs text-slate-400">units</span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-3">
                              <button
                                onClick={() => handleSaveStock(row.productId)}
                                disabled={stockSaving}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                              >
                                <Save className="w-3 h-3" />
                                {stockSaving ? "Saving…" : "Save"}
                              </button>
                              <button
                                onClick={() => { setEditingStockId(null); setStockSaveMsg(null); }}
                                className="px-3 py-1.5 text-xs text-slate-600 rounded-lg bg-slate-200"
                              >
                                Cancel
                              </button>
                              {stockSaveMsg && (
                                <span className={`text-xs font-medium ${stockSaveMsg.startsWith("Error") ? "text-rose-600" : "text-emerald-600"}`}>
                                  {stockSaveMsg}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── More Tab ── */}
        {activeTab === "more" && (
          <div className="p-4 space-y-4">
            {/* Product created success banner */}
            {createdBanner && (
              <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/80 p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-emerald-800">Draft created!</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Tap your draft below to review and submit it for admin approval.</p>
                </div>
                <button onClick={() => setCreatedBanner(false)} className="text-emerald-400 hover:text-emerald-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {/* Products list */}
            <div className="glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <Package className="w-4 h-4 text-lime-600" />
                  My Products
                  <span className="text-xs font-normal text-slate-400">({stats.total})</span>
                </h2>
                <button
                  onClick={() => router.push("/seller/products/new")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-lime-500 text-white text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              </div>
              {/* Status filter (compact) */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3">
                {[
                  { key: "all", label: "All", count: stats.total },
                  { key: "approved", label: "Live", count: stats.approved },
                  { key: "submitted", label: "Pending", count: stats.submitted },
                  { key: "draft", label: "Draft", count: stats.draft },
                  { key: "rejected", label: "Rejected", count: stats.rejected },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setStatusFilter(t.key as any)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                      statusFilter === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {t.label}
                    <span className={`text-[9px] px-1 rounded-full ${statusFilter === t.key ? "bg-white/20" : "bg-white"}`}>{t.count}</span>
                  </button>
                ))}
              </div>
              {filteredProducts.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">No products found.</p>
              ) : (
                <div className="space-y-2">
                  {filteredProducts.map((product) => {
                    const cfg = getStatusConfig(product.status);
                    const StatusIcon = cfg.icon;
                    return (
                      <div
                        key={product.id}
                        onClick={() => router.push(`/seller/products/${product.id}`)}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/60 border border-slate-200/40 active:bg-slate-50"
                      >
                        <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl">{product.emoji || "📦"}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{product.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${cfg.bg} ${cfg.color}`}>
                              <StatusIcon className="w-2.5 h-2.5" />
                              {product.status}
                            </span>
                            <span className="text-[10px] text-slate-400">{formatMoney(product.seller_price_cents)}</span>
                          </div>
                          {product.status === "draft" && (
                            <p className="text-[9px] text-amber-600 font-semibold mt-0.5">Tap to review &amp; submit →</p>
                          )}
                          {product.status === "rejected" && (
                            <p className="text-[9px] text-rose-600 font-semibold mt-0.5">Tap to fix &amp; resubmit →</p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Edit Info — all fields, matching desktop */}
            <section className={`glass-card rounded-2xl p-4 ${!hasBankInfo ? "border border-amber-200/60 bg-gradient-to-br from-amber-50/60 to-white/80" : ""}`}>
              <button
                onClick={() => setShowEditInfo((prev) => !prev)}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-400" />
                  <h3 className="font-semibold text-slate-900 text-sm">Edit Your Information</h3>
                  {!hasBankInfo && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Bank missing</span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showEditInfo ? "rotate-180" : ""}`} />
              </button>
              {showEditInfo && (
                <div className="mt-4 pt-4 border-t border-slate-200/70 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Contact</p>
                  <input type="text" value={profileForm.displayName}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, displayName: e.target.value }))}
                    placeholder="Store Display Name"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />
                  <input type="text" value={profileForm.fullName}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Full Name"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />
                  <input type="text" value={profileForm.phone}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="Phone (+251...)"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />
                  <input type="email" value={profileForm.email} disabled
                    className="w-full rounded-xl border border-slate-200 bg-slate-100/80 px-3 py-2.5 text-sm text-slate-400"
                  />

                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 pt-1">Address</p>
                  <input type="text" value={profileForm.addressLine1}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, addressLine1: e.target.value }))}
                    placeholder="Street, building, landmark"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={profileForm.city}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, city: e.target.value }))}
                      placeholder="City"
                      className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                    />
                    <input type="text" value={profileForm.subcity}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, subcity: e.target.value }))}
                      placeholder="Subcity"
                      className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                    />
                  </div>
                  <textarea value={profileForm.notes}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    placeholder="Contact notes (call time, hints…)"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />

                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 pt-1 flex items-center gap-1.5">
                    <Wallet className="w-3 h-3 text-amber-500" />
                    Payout Bank
                    {!hasBankInfo && <span className="text-amber-600 font-bold">— required for payouts</span>}
                  </p>
                  <input type="text" value={bankForm.bankName}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, bankName: e.target.value }))}
                    placeholder="Bank Name (e.g. Commercial Bank of Ethiopia)"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />
                  <input type="text" value={bankForm.accountHolder}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, accountHolder: e.target.value }))}
                    placeholder="Account Holder Name"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />
                  <input type="text" value={bankForm.accountNumber}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                    placeholder="Account Number"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />
                  <input type="text" value={bankForm.branch}
                    onChange={(e) => setBankForm((prev) => ({ ...prev, branch: e.target.value }))}
                    placeholder="Branch (optional)"
                    className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-lime-500/40"
                  />

                  <button
                    onClick={saveSellerInfo}
                    disabled={infoSaving}
                    className="w-full py-2.5 rounded-xl bg-lime-500 text-white text-sm font-semibold disabled:opacity-60"
                  >
                    {infoSaving ? "Saving..." : "Save Information"}
                  </button>
                  {infoSaveMsg && <p className="text-xs text-slate-600 text-center">{infoSaveMsg}</p>}
                </div>
              )}
            </section>

            {/* Recent Activity */}
            {activities.length > 0 && (
              <div className="glass-card rounded-2xl p-4">
                <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-blue-500" />
                  Recent Activity
                </h3>
                <div className="space-y-2">
                  {activities.map((activity, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50/80">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        activity.type === "product" ? "bg-lime-100 text-lime-600" :
                        activity.type === "payout" ? "bg-emerald-100 text-emerald-600" :
                        "bg-blue-100 text-blue-600"
                      }`}>
                        {activity.type === "product" ? <Package className="w-3.5 h-3.5" /> :
                         activity.type === "payout" ? <DollarSign className="w-3.5 h-3.5" /> :
                         <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-900 truncate">{activity.message}</p>
                        <p className="text-[10px] text-slate-400">{formatRelativeTime(activity.time)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick links + sign out */}
            <div className="glass-card rounded-2xl p-4">
              <h3 className="font-semibold text-slate-900 text-sm mb-3">Quick Links</h3>
              <div className="space-y-1">
                {[
                  { label: "Verification", icon: FileText, path: "/seller/verification" },
                  { label: "Payout History", icon: Wallet, path: "/seller/payouts" },
                  { label: "Settings", icon: Settings, path: "/seller/settings" },
                ].map((link) => (
                  <button
                    key={link.path}
                    onClick={() => router.push(link.path)}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <link.icon className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-700">{link.label}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300" />
                  </button>
                ))}
                <button
                  onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-rose-50 transition-colors text-rose-600"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-sm font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── MOBILE BOTTOM NAV BAR ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 backdrop-blur-xl border-t border-slate-200/60 px-1 pt-1 pb-2">
        <div className="flex items-end justify-around max-w-sm mx-auto">
          {/* Home */}
          <button
            onClick={() => switchTab("home")}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${activeTab === "home" ? "text-lime-600" : "text-slate-400"}`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[9px] font-semibold">Home</span>
          </button>
          {/* Orders */}
          <button
            onClick={() => switchTab("orders")}
            className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${activeTab === "orders" ? "text-lime-600" : "text-slate-400"}`}
          >
            <ShoppingBag className="w-5 h-5" />
            {sellerOrders.length > 0 && (
              <span className="absolute -top-0.5 right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[8px] font-bold flex items-center justify-center">
                {sellerOrders.length > 9 ? "9+" : sellerOrders.length}
              </span>
            )}
            <span className="text-[9px] font-semibold">Orders</span>
          </button>
          {/* + Add (center CTA) */}
          <button
            onClick={() => router.push("/seller/products/new")}
            className="flex flex-col items-center gap-0.5 -mt-4 mb-0.5"
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-lime-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-lime-500/30 active:scale-95 transition-transform">
              <Plus className="w-6 h-6 text-white" />
            </div>
            <span className="text-[9px] font-semibold text-slate-400">Add</span>
          </button>
          {/* Stock */}
          <button
            onClick={() => switchTab("stock")}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${activeTab === "stock" ? "text-lime-600" : "text-slate-400"}`}
          >
            <Box className="w-5 h-5" />
            <span className="text-[9px] font-semibold">Stock</span>
          </button>
          {/* More */}
          <button
            onClick={() => switchTab("more")}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${activeTab === "more" ? "text-lime-600" : "text-slate-400"}`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[9px] font-semibold">More</span>
          </button>
        </div>
      </nav>
    </main>
  );
}