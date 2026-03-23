// app/admin/promotions/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  Tag,
  Plus,
  ArrowLeft,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Scope = "product" | "category";

type Promotion = {
  id: string;
  label: string;
  discount_pct: number;
  scope: Scope;
  product_id: string | null;
  category_id: string | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
  product_name?: string | null;
  category_name?: string | null;
};

type ProductOption = { id: string; name: string; price_cents: number | null; final_price_cents: number | null };
type CategoryOption = { id: string; name: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isExpired(ends_at: string) {
  return new Date(ends_at) < new Date();
}

function isUpcoming(starts_at: string) {
  return new Date(starts_at) > new Date();
}

function statusLabel(p: Promotion): { label: string; color: string } {
  if (p.is_active)               return { label: "Active",   color: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (isExpired(p.ends_at))      return { label: "Expired",  color: "bg-slate-100 text-slate-500 border-slate-200" };
  if (isUpcoming(p.starts_at))   return { label: "Scheduled",color: "bg-blue-100 text-blue-700 border-blue-200" };
  return                                { label: "Inactive",  color: "bg-amber-100 text-amber-700 border-amber-200" };
}

// ─── Blank form ───────────────────────────────────────────────────────────────

function blankForm() {
  const now   = new Date();
  const later = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const toLocal = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  return {
    label:       "",
    discount_pct: "",
    scope:       "product" as Scope,
    product_id:  "",
    category_id: "",
    starts_at:   toLocal(now),
    ends_at:     toLocal(later),
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPromotionsPage() {
  const router = useRouter();

  const [checking, setChecking]   = useState(true);
  const [isAdmin, setIsAdmin]     = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const [promotions, setPromotions]     = useState<Promotion[]>([]);
  const [products, setProducts]         = useState<ProductOption[]>([]);
  const [categories, setCategories]     = useState<CategoryOption[]>([]);
  const [loading, setLoading]           = useState(true);
  const [savingId, setSavingId]         = useState<string | null>(null);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [formError, setFormError]       = useState<string | null>(null);
  const [formSaving, setFormSaving]     = useState(false);
  const [form, setForm]                 = useState(blankForm());
  const [filterScope, setFilterScope]   = useState<"all" | "active" | "inactive" | "expired">("all");

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user;
        if (!user) { router.replace("/login"); return; }
        const { data, error } = await supabase
          .from("profiles").select("role").eq("id", user.id).single();
        if (error || !data || data.role !== "admin") { router.replace("/"); return; }
        if (alive) setIsAdmin(true);
      } finally {
        if (alive) setChecking(false);
      }
    }
    check();
    return () => { alive = false; };
  }, [router]);

  // ── Load data ─────────────────────────────────────────────────────────────
  async function loadAll() {
    setLoading(true);
    setPageError(null);
    try {
      // Promotions with joined names
      const { data: promoData, error: promoError } = await supabase
        .from("promotions")
        .select(`
          id, label, discount_pct, scope,
          product_id, category_id,
          starts_at, ends_at, is_active, created_at,
          products(name),
          categories(name)
        `)
        .order("created_at", { ascending: false });

      if (promoError) throw promoError;

      setPromotions(
        (promoData ?? []).map((r: any) => ({
          id:            r.id,
          label:         r.label,
          discount_pct:  r.discount_pct,
          scope:         r.scope,
          product_id:    r.product_id,
          category_id:   r.category_id,
          starts_at:     r.starts_at,
          ends_at:       r.ends_at,
          is_active:     r.is_active,
          created_at:    r.created_at,
          product_name:  r.products?.name ?? null,
          category_name: r.categories?.name ?? null,
        }))
      );

      // Products for dropdown
      const { data: prodData } = await supabase
        .from("products")
        .select("id, name, price_cents, final_price_cents")
        .eq("status", "approved")
        .eq("is_active", true)
        .order("name", { ascending: true });
      setProducts((prodData ?? []) as ProductOption[]);

      // Categories for dropdown
      const { data: catData } = await supabase
        .from("categories")
        .select("id, name")
        .order("name", { ascending: true });
      setCategories((catData ?? []) as CategoryOption[]);

    } catch (err: any) {
      setPageError(err?.message ?? "Failed to load promotions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) loadAll();
  }, [isAdmin]);

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (filterScope === "all")      return promotions;
    if (filterScope === "active")   return promotions.filter((p) => p.is_active);
    if (filterScope === "expired")  return promotions.filter((p) => isExpired(p.ends_at));
    if (filterScope === "inactive") return promotions.filter((p) => !p.is_active && !isExpired(p.ends_at));
    return promotions;
  }, [promotions, filterScope]);

  const counts = useMemo(() => ({
    all:      promotions.length,
    active:   promotions.filter((p) => p.is_active).length,
    inactive: promotions.filter((p) => !p.is_active && !isExpired(p.ends_at)).length,
    expired:  promotions.filter((p) => isExpired(p.ends_at)).length,
  }), [promotions]);

  // ── Activate ──────────────────────────────────────────────────────────────
  async function handleActivate(id: string) {
    setSavingId(id);
    setPageError(null);
    try {
      const { error } = await supabase.rpc("apply_promotion", { p_promotion_id: id });
      if (error) throw error;
      await loadAll();
    } catch (err: any) {
      setPageError(err?.message ?? "Failed to activate promotion.");
    } finally {
      setSavingId(null);
    }
  }

  // ── Deactivate ────────────────────────────────────────────────────────────
  async function handleDeactivate(id: string) {
    setSavingId(id);
    setPageError(null);
    try {
      const { error } = await supabase.rpc("deactivate_promotion", { p_promotion_id: id });
      if (error) throw error;
      await loadAll();
    } catch (err: any) {
      setPageError(err?.message ?? "Failed to deactivate promotion.");
    } finally {
      setSavingId(null);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(p: Promotion) {
    if (!confirm(`Delete "${p.label}"? This cannot be undone.`)) return;
    setSavingId(p.id);
    setPageError(null);
    try {
      // If active, deactivate first to restore prices
      if (p.is_active) {
        const { error: deErr } = await supabase.rpc("deactivate_promotion", {
          p_promotion_id: p.id,
        });
        if (deErr) throw deErr;
      }
      const { error } = await supabase.from("promotions").delete().eq("id", p.id);
      if (error) throw error;
      await loadAll();
    } catch (err: any) {
      setPageError(err?.message ?? "Failed to delete promotion.");
    } finally {
      setSavingId(null);
    }
  }

  // ── Create ────────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Validate
    if (!form.label.trim())        { setFormError("Label is required."); return; }
    const pct = parseInt(form.discount_pct as any, 10);
    if (!pct || pct < 1 || pct > 99) { setFormError("Discount must be between 1 and 99%."); return; }
    if (form.scope === "product"  && !form.product_id)  { setFormError("Select a product.");  return; }
    if (form.scope === "category" && !form.category_id) { setFormError("Select a category."); return; }
    if (!form.starts_at || !form.ends_at)               { setFormError("Set start and end dates."); return; }
    if (new Date(form.ends_at) <= new Date(form.starts_at)) {
      setFormError("End date must be after start date.");
      return;
    }

    setFormSaving(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id ?? null;

      const payload: any = {
        label:        form.label.trim(),
        discount_pct: pct,
        scope:        form.scope,
        product_id:   form.scope === "product"  ? form.product_id  : null,
        category_id:  form.scope === "category" ? form.category_id : null,
        starts_at:    new Date(form.starts_at).toISOString(),
        ends_at:      new Date(form.ends_at).toISOString(),
        is_active:    false,
        created_by:   uid,
      };

      const { error } = await supabase.from("promotions").insert(payload);
      if (error) throw error;

      setForm(blankForm());
      setShowForm(false);
      await loadAll();
    } catch (err: any) {
      setFormError(err?.message ?? "Failed to create promotion.");
    } finally {
      setFormSaving(false);
    }
  }

  // ── Render guards ─────────────────────────────────────────────────────────
  if (checking) {
    return (
      <main className="py-4 md:py-6">
        <div className="glass glass-ring rounded-[28px] p-6 text-sm text-slate-700">
          Loading…
        </div>
      </main>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="py-4 md:py-6 space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
              Admin
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
              Promotions
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-xl">
              Create time-limited percentage discounts on products or entire categories.
              Activating a promotion writes the discounted price directly to affected products.
              Deactivating restores original prices.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={loadAll}
              className="p-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => router.push("/admin")}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </button>
            <button
              onClick={() => { setShowForm((v) => !v); setFormError(null); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Promotion
            </button>
          </div>
        </div>

        {pageError && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800">
            {pageError}
          </div>
        )}

        {/* Stat tabs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          {(["all", "active", "inactive", "expired"] as const).map((key) => {
            const colors = {
              all:      { active: "border-slate-700 bg-slate-50",    number: "text-slate-800" },
              active:   { active: "border-emerald-500 bg-emerald-50", number: "text-emerald-700" },
              inactive: { active: "border-amber-500 bg-amber-50",    number: "text-amber-700" },
              expired:  { active: "border-slate-400 bg-slate-50",    number: "text-slate-500" },
            }[key];
            return (
              <button
                key={key}
                onClick={() => setFilterScope(key)}
                className={`p-4 rounded-2xl border-2 transition-all text-left ${
                  filterScope === key
                    ? colors.active
                    : "border-slate-100 bg-white hover:border-slate-200"
                }`}
              >
                <div className={`text-2xl font-black ${colors.number}`}>{counts[key]}</div>
                <div className="text-xs font-bold text-slate-500 uppercase capitalize">{key}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Create form ────────────────────────────────────────────────────── */}
      {showForm && (
        <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
            <Tag className="w-5 h-5 text-slate-500" />
            New Promotion
          </h2>

          <form onSubmit={handleCreate} className="space-y-5">

            {/* Label */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Promotion Label
              </label>
              <input
                type="text"
                placeholder='e.g. "Weekend Flash Sale"'
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:bg-white transition-all"
              />
            </div>

            {/* Discount % */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Discount Percentage
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={99}
                  placeholder="e.g. 20"
                  value={form.discount_pct}
                  onChange={(e) => setForm((f) => ({ ...f, discount_pct: e.target.value }))}
                  className="w-28 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:bg-white transition-all"
                />
                <span className="text-sm text-slate-500">%</span>
                <div className="flex gap-1.5">
                  {[5, 10, 15, 20, 25, 30, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, discount_pct: String(pct) }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        String(form.discount_pct) === String(pct)
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Scope */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                Apply To
              </label>
              <div className="flex gap-3">
                {(["product", "category"] as Scope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, scope: s, product_id: "", category_id: "" }))}
                    className={`px-5 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all capitalize ${
                      form.scope === s
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {s === "product" ? "Single Product" : "Entire Category"}
                  </button>
                ))}
              </div>
            </div>

            {/* Product or Category dropdown */}
            {form.scope === "product" ? (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                  Product
                </label>
                <select
                  value={form.product_id}
                  onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:bg-white transition-all"
                >
                  <option value="">— Select a product —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.final_price_cents
                        ? ` — ETB ${(p.final_price_cents / 100).toFixed(2)}`
                        : p.price_cents
                        ? ` — ETB ${(p.price_cents / 100).toFixed(2)}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                  Category
                </label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:bg-white transition-all"
                >
                  <option value="">— Select a category —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Date range */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                  Starts At
                </label>
                <input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:bg-white transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                  Ends At
                </label>
                <input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:bg-white transition-all"
                />
              </div>
            </div>

            {formError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {formError}
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={formSaving}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-wait"
              >
                {formSaving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {formSaving ? "Creating…" : "Create Promotion"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setFormError(null); setForm(blankForm()); }}
                className="px-5 py-3 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* ── Promotions list ───────────────────────────────────────────────── */}
      <section className="glass glass-ring rounded-[28px] p-4 md:p-6 space-y-4">
        {loading ? (
          <div className="text-sm text-slate-600 py-4">Loading promotions…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🏷️</div>
            <p className="text-base font-bold text-slate-900">No promotions found</p>
            <p className="text-sm text-slate-500 mt-1">
              {filterScope === "all"
                ? "Create your first promotion above."
                : `No ${filterScope} promotions.`}
            </p>
          </div>
        ) : (
          filtered.map((promo) => {
            const status     = statusLabel(promo);
            const isSaving   = savingId === promo.id;
            const isExpiredP = isExpired(promo.ends_at);
            const isExpanded = expandedId === promo.id;

            return (
              <div
                key={promo.id}
                className={`bg-white rounded-2xl border-2 transition-all duration-200 ${
                  promo.is_active
                    ? "border-emerald-200"
                    : isExpiredP
                    ? "border-slate-100"
                    : "border-slate-200"
                }`}
              >
                {/* Card header */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : promo.id)}
                  className="w-full text-left p-5 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {/* Status dot */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      promo.is_active
                        ? "bg-emerald-500 animate-pulse"
                        : isExpiredP
                        ? "bg-slate-300"
                        : "bg-amber-400"
                    }`} />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">
                          {promo.label}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide border ${status.color}`}>
                          {status.label}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-700 border border-rose-200">
                          {promo.discount_pct}% OFF
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 capitalize">
                          {promo.scope}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                        <span className="font-semibold text-slate-700">
                          {promo.scope === "product"
                            ? (promo.product_name  ?? "—")
                            : (promo.category_name ?? "—")}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(promo.starts_at)} → {formatDate(promo.ends_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-slate-400">
                    {isExpanded
                      ? <ChevronUp className="w-5 h-5" />
                      : <ChevronDown className="w-5 h-5" />}
                  </div>
                </button>

                {/* Expanded actions */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">

                      {/* Activate */}
                      {!promo.is_active && !isExpiredP && (
                        <button
                          onClick={() => handleActivate(promo.id)}
                          disabled={isSaving}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50 shadow-sm shadow-emerald-500/25"
                        >
                          {isSaving
                            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Zap className="w-4 h-4" />}
                          Activate Now
                        </button>
                      )}

                      {/* Deactivate */}
                      {promo.is_active && (
                        <button
                          onClick={() => handleDeactivate(promo.id)}
                          disabled={isSaving}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
                        >
                          {isSaving
                            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <XCircle className="w-4 h-4" />}
                          Deactivate & Restore Prices
                        </button>
                      )}

                      {/* Info when expired */}
                      {isExpiredP && !promo.is_active && (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-500 text-sm">
                          <Clock className="w-4 h-4" />
                          Expired — prices already restored
                        </div>
                      )}

                      {/* Expired but still somehow active — edge case safety */}
                      {isExpiredP && promo.is_active && (
                        <button
                          onClick={() => handleDeactivate(promo.id)}
                          disabled={isSaving}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-500 text-white text-sm font-semibold hover:bg-rose-600 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          Expired — Restore Prices Now
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(promo)}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-50 ml-auto"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>

                    {/* Summary info box */}
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "Scope",    value: promo.scope === "product" ? "Single Product" : "Entire Category" },
                        { label: "Target",   value: promo.scope === "product" ? (promo.product_name ?? "—") : (promo.category_name ?? "—") },
                        { label: "Discount", value: `${promo.discount_pct}%` },
                        { label: "Created",  value: formatDate(promo.created_at) },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                            {label}
                          </div>
                          <div className="text-sm font-semibold text-slate-800 truncate">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}