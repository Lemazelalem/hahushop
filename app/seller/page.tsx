// app/seller/page.tsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  Store
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

type PayoutRowLite = {
  status: string | null;
  calculated_amount_cents: number | null;
  adjusted_amount_cents: number | null;
  paid_at?: string | null;
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

  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatus | "all">("all");
  const [showEarnings, setShowEarnings] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showQuickLinks, setShowQuickLinks] = useState(false);
  const [showSales, setShowSales] = useState(false);
  
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
  const [soldItems, setSoldItems] = useState<SoldItem[]>([]);
  const [newSaleCount, setNewSaleCount] = useState(0);
  const [bankSaving, setBankSaving] = useState(false);
  const [bankSaveMsg, setBankSaveMsg] = useState<string | null>(null);
  const [showBankBannerForm, setShowBankBannerForm] = useState(false);
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoSaveMsg, setInfoSaveMsg] = useState<string | null>(null);
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

      // Load payouts
      const { data: payoutData } = await supabase
        .from("seller_payouts")
        .select("*")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });

      if (payoutData) {
        let totalRecorded = 0;
        let totalPaid = 0;
        let lastPayoutAt: string | null = null;

        payoutData.forEach((row: PayoutRowLite) => {
          const amount = row.adjusted_amount_cents ?? row.calculated_amount_cents ?? 0;
          if (amount > 0) {
            totalRecorded += amount;
            if (row.status?.toLowerCase() === "paid") {
              totalPaid += amount;
              if (row.paid_at && (!lastPayoutAt || row.paid_at > lastPayoutAt)) {
                lastPayoutAt = row.paid_at;
              }
            }
          }
        });

        setPayoutTotals({
          totalRecordedCents: totalRecorded,
          totalPaidCents: totalPaid,
          totalPendingCents: Math.max(totalRecorded - totalPaid, 0),
          lastPayoutAt,
        });

        // Load sold items
        const { data: salesData } = await supabase
          .from("order_items")
          .select(`
            id, product_id, name_snapshot, image_url_snapshot, emoji_snapshot,
            quantity, line_total_cents, order_id,
            orders(created_at, status, payment_status)
          `)
          .eq("seller_id", user.id)
          .order("order_id", { ascending: false })
          .limit(30);

        if (salesData) {
          const mapped: SoldItem[] = (salesData as any[])
            .filter((item) => item.orders?.status !== "cancelled")
            .map((item) => ({
              id: item.id,
              product_id: item.product_id,
              name_snapshot: item.name_snapshot,
              image_url_snapshot: item.image_url_snapshot,
              emoji_snapshot: item.emoji_snapshot,
              quantity: item.quantity,
              line_total_cents: item.line_total_cents,
              order_id: item.order_id,
              order_created_at: item.orders?.created_at ?? new Date().toISOString(),
              order_status: item.orders?.status ?? "unknown",
              order_payment_status: item.orders?.payment_status ?? "unknown",
            }))
            .slice(0, 20);

          setSoldItems(mapped);
        }

        // Generate activities
        const recentActivities: ActivityItem[] = [];
        
        // Add product activities
        (rows || []).slice(0, 3).forEach((p: ProductRow) => {
          recentActivities.push({
            id: p.id,
            type: 'product',
            message: `Product "${p.name}" ${p.status}`,
            time: p.created_at,
            status: p.status,
          });
        });

        // Add payout activities
        payoutData.slice(0, 2).forEach((p: PayoutRowLite, idx: number) => {
          const amount = p.adjusted_amount_cents ?? p.calculated_amount_cents ?? 0;
          recentActivities.push({
            id: `payout-${idx}`,
            type: 'payout',
            message: p.status === 'paid' ? 'Payout received' : 'Payout pending',
            time: p.paid_at || new Date().toISOString(),
          });
        });

        setActivities(recentActivities.slice(0, 5));
      }

    } catch (err: any) {
      console.error(err);
      setPageError(err.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, []);

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
          const newSale: SoldItem = {
            id: item.id,
            product_id: item.product_id,
            name_snapshot: item.name_snapshot,
            image_url_snapshot: item.image_url_snapshot,
            emoji_snapshot: item.emoji_snapshot,
            quantity: item.quantity,
            line_total_cents: item.line_total_cents,
            order_id: item.order_id,
            order_created_at: new Date().toISOString(),
            order_status: "pending",
            order_payment_status: "unpaid",
          };
          setSoldItems((prev) => [newSale, ...prev].slice(0, 20));
          setNewSaleCount((prev) => prev + 1);
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

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [products, searchQuery, statusFilter]);

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
              <h1 className="font-bold text-slate-900">Seller Dashboard</h1>
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
              onClick={() => setNewSaleCount(0)}
              className="relative p-2 rounded-lg hover:bg-slate-100/80 transition-colors"
              title="Recent sales"
            >
              <Bell className="w-5 h-5 text-slate-600" />
              {newSaleCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {newSaleCount > 9 ? "9+" : newSaleCount}
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

      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
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
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Pending Payout</p>
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
            {/* Recent Activity — collapsible on mobile */}
            <div className="glass-card rounded-2xl p-4 sm:p-5">
              <button
                onClick={() => setShowActivity(!showActivity)}
                className="md:hidden w-full flex items-center justify-between"
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
              <h3 className="hidden md:flex font-bold text-slate-900 items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-blue-600" />
                Recent Activity
              </h3>
              <div className={`space-y-3 ${showActivity ? 'mt-3' : 'hidden md:block'}`}>
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

            {/* Quick Links — collapsible on mobile */}
            <div className="glass-card rounded-2xl p-4 sm:p-5">
              <button
                onClick={() => setShowQuickLinks(!showQuickLinks)}
                className="md:hidden w-full flex items-center justify-between"
              >
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-400" />
                  Quick Links
                </h3>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showQuickLinks ? 'rotate-180' : ''}`} />
              </button>
              <h3 className="hidden md:block font-bold text-slate-900 mb-4">Quick Links</h3>
              <div className={`space-y-2 ${showQuickLinks ? 'mt-3' : 'hidden md:block'}`}>
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

            {/* Recent Sales — collapsible on mobile */}
            <div className="glass-card rounded-2xl p-4 sm:p-5">
              <button
                onClick={() => setShowSales(!showSales)}
                className="md:hidden w-full flex items-center justify-between"
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
              <h3 className="hidden md:flex font-bold text-slate-900 items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                Recent Sales
                {newSaleCount > 0 && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 text-xs font-bold">
                    {newSaleCount} new
                  </span>
                )}
              </h3>

              <div className={`${showSales ? 'mt-3' : 'hidden md:block'}`}>
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
    </main>
  );
}