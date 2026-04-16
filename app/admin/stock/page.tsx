"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { ChevronDown, ChevronUp, Save } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type SizeVariantData = {
  id: string;
  label: string;
  stock: number;
  priceAdjustCents?: number;
  [key: string]: unknown;
};

type ProductRow = {
  id: string;
  name: string;
  seller_id: string | null;
  status: string | null;
  is_active: boolean | null;
  stock_quantity: number | null;
  size_variants: SizeVariantData[] | null;
  created_at: string | null;
};

type StockLevel = "out" | "low" | "ok" | "unknown";

type StockRow = {
  id: string;
  name: string;
  sellerId: string | null;
  sellerName: string;
  status: string;
  stock: number | null;
  createdAt: string | null;
  level: StockLevel;
  hasVariants: boolean;
  size_variants: SizeVariantData[] | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getProductStock(product: ProductRow): number | null {
  if (Array.isArray(product.size_variants) && product.size_variants.length > 0) {
    return product.size_variants.reduce(
      (sum, v) => sum + Math.max(0, Number(v?.stock ?? 0)),
      0
    );
  }
  if (typeof product.stock_quantity === "number") {
    return Math.max(0, Number(product.stock_quantity));
  }
  return null;
}

function levelFrom(stock: number | null): StockLevel {
  if (stock === null) return "unknown";
  if (stock <= 0) return "out";
  if (stock <= 5) return "low";
  return "ok";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminStockPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<StockRow[]>([]);

  // Simple (non-variant) stock editor state
  const [editStockById, setEditStockById] = useState<Record<string, string>>({});
  const [savingStockId, setSavingStockId] = useState<string | null>(null);

  // Variant stock editor state
  // key: `${productId}:${variantId}`
  const [editSizeStock, setEditSizeStock] = useState<Record<string, string>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [savingVariantId, setSavingVariantId] = useState<string | null>(null);

  // Filter tab
  const [activeFilter, setActiveFilter] = useState<"all" | StockLevel>("all");

  // ─── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    async function run() {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user;
        if (!user) { router.replace("/auth/login"); return; }
        const { data, error } = await supabase
          .from("profiles").select("role").eq("id", user.id).maybeSingle();
        if (error || !data || data.role !== "admin") { router.replace("/"); return; }
        if (alive) setIsAdmin(true);
      } finally {
        if (alive) setChecking(false);
      }
    }
    run();
    return () => { alive = false; };
  }, [router]);

  // ─── Load products ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setErrorMsg(null);

        const { data: products, error: productErr } = await supabase
          .from("products")
          .select("id, name, seller_id, status, is_active, stock_quantity, size_variants, created_at")
          .order("created_at", { ascending: false });

        if (productErr) throw productErr;

        const list = (products ?? []) as ProductRow[];

        // Fetch seller display names
        const sellerIds = Array.from(
          new Set(list.map((p) => p.seller_id).filter((s): s is string => Boolean(s)))
        );
        const sellerNameMap = new Map<string, string>();
        if (sellerIds.length > 0) {
          const idsParam = encodeURIComponent(sellerIds.join(","));
          const res = await fetch(`/api/admin/profiles?ids=${idsParam}`);
          if (res.ok) {
            const json = await res.json();
            const profiles = (json.profiles ?? []) as Array<{
              id: string; display_name: string | null; full_name: string | null;
            }>;
            for (const p of profiles) {
              sellerNameMap.set(p.id, p.display_name ?? p.full_name ?? "Unknown seller");
            }
          }
        }

        const mapped: StockRow[] = list.map((p) => {
          const stock = getProductStock(p);
          const hasVariants = Array.isArray(p.size_variants) && p.size_variants.length > 0;
          const validVariants = hasVariants
            ? (p.size_variants as SizeVariantData[]).filter((v) => v && v.id && v.label)
            : null;
          return {
            id: p.id,
            name: p.name ?? "Untitled",
            sellerId: p.seller_id,
            sellerName: p.seller_id ? sellerNameMap.get(p.seller_id) ?? "Unknown seller" : "No seller",
            status: p.status ?? "unknown",
            stock,
            createdAt: p.created_at,
            level: levelFrom(stock),
            hasVariants,
            size_variants: validVariants,
          };
        });

        // Sort: out → low → ok → unknown, then by ascending stock within tier
        mapped.sort((a, b) => {
          const rank: Record<StockLevel, number> = { out: 0, low: 1, ok: 2, unknown: 3 };
          const aS = a.stock ?? Number.MAX_SAFE_INTEGER;
          const bS = b.stock ?? Number.MAX_SAFE_INTEGER;
          return rank[a.level] - rank[b.level] || aS - bS;
        });

        if (!alive) return;
        setRows(mapped);

        // Seed edit inputs
        const simpleEdits: Record<string, string> = {};
        const variantEdits: Record<string, string> = {};
        for (const r of mapped) {
          if (!r.hasVariants) {
            simpleEdits[r.id] = r.stock === null ? "" : String(r.stock);
          } else if (r.size_variants) {
            for (const sv of r.size_variants) {
              variantEdits[`${r.id}:${sv.id}`] = String(sv.stock ?? 0);
            }
          }
        }
        setEditStockById(simpleEdits);
        setEditSizeStock(variantEdits);
      } catch (err: any) {
        console.error("[admin stock] load error:", err);
        if (alive) { setErrorMsg(err?.message || "Failed to load stock table."); setRows([]); }
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => { alive = false; };
  }, [isAdmin]);

  // ─── Save simple (non-variant) stock ───────────────────────────────────────
  async function handleSaveStock(row: StockRow) {
    const raw = editStockById[row.id] ?? "";
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setErrorMsg("Stock must be a non-negative number.");
      return;
    }
    try {
      setSavingStockId(row.id);
      setErrorMsg(null);
      const { error } = await supabase
        .from("products")
        .update({ stock_quantity: Math.floor(parsed), updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw error;
      const newStock = Math.floor(parsed);
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, stock: newStock, level: levelFrom(newStock) } : r
        )
      );
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to save stock.");
    } finally {
      setSavingStockId(null);
    }
  }

  // ─── Save variant stock (updates size_variants array) ──────────────────────
  async function handleSaveVariantStock(row: StockRow) {
    if (!row.size_variants) return;
    const updatedVariants: SizeVariantData[] = row.size_variants.map((sv) => ({
      ...sv,
      stock: Math.max(
        0,
        Math.floor(Number(editSizeStock[`${row.id}:${sv.id}`] ?? sv.stock) || 0)
      ),
    }));
    try {
      setSavingVariantId(row.id);
      setErrorMsg(null);
      const { error } = await supabase
        .from("products")
        .update({ size_variants: updatedVariants, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) throw error;
      const totalStock = updatedVariants.reduce((s, v) => s + v.stock, 0);
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, stock: totalStock, level: levelFrom(totalStock), size_variants: updatedVariants }
            : r
        )
      );
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to save variant stock.");
    } finally {
      setSavingVariantId(null);
    }
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ─── Derived ───────────────────────────────────────────────────────────────
  const totals = useMemo(() => ({
    out: rows.filter((r) => r.level === "out").length,
    low: rows.filter((r) => r.level === "low").length,
    ok: rows.filter((r) => r.level === "ok").length,
    unknown: rows.filter((r) => r.level === "unknown").length,
  }), [rows]);

  const filteredRows = useMemo(
    () => activeFilter === "all" ? rows : rows.filter((r) => r.level === activeFilter),
    [rows, activeFilter]
  );

  // ─── Loading / access guards ───────────────────────────────────────────────
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

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="py-4 md:py-6 space-y-6">
      {/* Header */}
      <section className="glass glass-ring rounded-[28px] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">Admin</div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">Stock Table</h1>
            <p className="text-sm text-slate-700 mt-1">
              Track and update product stock levels across sellers.
            </p>
          </div>
          <button
            onClick={() => router.push("/admin")}
            className="pill px-5 py-2 text-sm font-semibold text-slate-900 self-start"
          >
            ← Back to Admin
          </button>
        </div>

        {/* Filter tabs */}
        <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* All */}
          <button
            onClick={() => setActiveFilter("all")}
            className={[
              "rounded-xl border p-3 text-left transition-all",
              activeFilter === "all"
                ? "border-slate-900 bg-slate-900 text-white ring-2 ring-slate-900/20"
                : "border-slate-200 bg-slate-50 hover:border-slate-400",
            ].join(" ")}
          >
            <div className={`text-xs font-semibold uppercase ${activeFilter === "all" ? "text-slate-300" : "text-slate-600"}`}>All</div>
            <div className={`text-xl font-bold ${activeFilter === "all" ? "text-white" : "text-slate-800"}`}>{rows.length}</div>
          </button>

          {/* Out of Stock */}
          <button
            onClick={() => setActiveFilter(activeFilter === "out" ? "all" : "out")}
            className={[
              "rounded-xl border p-3 text-left transition-all",
              activeFilter === "out"
                ? "border-rose-600 bg-rose-600 text-white ring-2 ring-rose-600/20"
                : "border-rose-200 bg-rose-50 hover:border-rose-400",
            ].join(" ")}
          >
            <div className={`text-xs font-semibold uppercase ${activeFilter === "out" ? "text-rose-200" : "text-rose-700"}`}>Out of Stock</div>
            <div className={`text-xl font-bold ${activeFilter === "out" ? "text-white" : "text-rose-900"}`}>{totals.out}</div>
          </button>

          {/* Low Stock */}
          <button
            onClick={() => setActiveFilter(activeFilter === "low" ? "all" : "low")}
            className={[
              "rounded-xl border p-3 text-left transition-all",
              activeFilter === "low"
                ? "border-amber-500 bg-amber-500 text-white ring-2 ring-amber-500/20"
                : "border-amber-200 bg-amber-50 hover:border-amber-400",
            ].join(" ")}
          >
            <div className={`text-xs font-semibold uppercase ${activeFilter === "low" ? "text-amber-100" : "text-amber-700"}`}>Low Stock</div>
            <div className={`text-xl font-bold ${activeFilter === "low" ? "text-white" : "text-amber-900"}`}>{totals.low}</div>
          </button>

          {/* Healthy */}
          <button
            onClick={() => setActiveFilter(activeFilter === "ok" ? "all" : "ok")}
            className={[
              "rounded-xl border p-3 text-left transition-all",
              activeFilter === "ok"
                ? "border-emerald-600 bg-emerald-600 text-white ring-2 ring-emerald-600/20"
                : "border-emerald-200 bg-emerald-50 hover:border-emerald-400",
            ].join(" ")}
          >
            <div className={`text-xs font-semibold uppercase ${activeFilter === "ok" ? "text-emerald-100" : "text-emerald-700"}`}>Healthy</div>
            <div className={`text-xl font-bold ${activeFilter === "ok" ? "text-white" : "text-emerald-900"}`}>{totals.ok}</div>
          </button>

          {/* Unknown */}
          <button
            onClick={() => setActiveFilter(activeFilter === "unknown" ? "all" : "unknown")}
            className={[
              "rounded-xl border p-3 text-left transition-all col-span-2 md:col-span-1",
              activeFilter === "unknown"
                ? "border-slate-500 bg-slate-500 text-white ring-2 ring-slate-500/20"
                : "border-slate-200 bg-slate-50 hover:border-slate-400",
            ].join(" ")}
          >
            <div className={`text-xs font-semibold uppercase ${activeFilter === "unknown" ? "text-slate-200" : "text-slate-600"}`}>Unknown</div>
            <div className={`text-xl font-bold ${activeFilter === "unknown" ? "text-white" : "text-slate-800"}`}>{totals.unknown}</div>
          </button>
        </div>

        {activeFilter !== "all" && (
          <p className="mt-3 text-xs text-slate-500">
            Showing {filteredRows.length} of {rows.length} products •{" "}
            <button onClick={() => setActiveFilter("all")} className="underline hover:text-slate-800">
              Clear filter
            </button>
          </p>
        )}
      </section>

      {errorMsg && (
        <div className="glass glass-ring rounded-[20px] p-4 border border-rose-200 bg-rose-50/80 text-sm text-rose-800">
          {errorMsg}
        </div>
      )}

      {/* ── DESKTOP TABLE (md+) ──────────────────────────────────────────── */}
      <section className="glass glass-ring rounded-[28px] p-4 md:p-6 overflow-x-auto hidden md:block">
        {loading ? (
          <div className="text-sm text-slate-700">Loading stock table...</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-sm text-slate-600">No products match this filter.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b border-slate-200">
                <th className="py-2 pr-4 font-semibold">Product</th>
                <th className="py-2 pr-4 font-semibold">Seller</th>
                <th className="py-2 pr-4 font-semibold">Status</th>
                <th className="py-2 pr-4 font-semibold">Stock</th>
                <th className="py-2 pr-4 font-semibold">Edit Stock</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <>
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/products/${r.id}`)}
                    className="border-b border-slate-100 hover:bg-slate-50/80 cursor-pointer"
                    title="Open product details"
                  >
                    <td className="py-3 pr-4 font-semibold text-slate-900 max-w-[200px] truncate">
                      {r.name}
                    </td>
                    <td className="py-3 pr-4 text-slate-600 max-w-[140px] truncate">{r.sellerName}</td>
                    <td className="py-3 pr-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={[
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold",
                        r.level === "out" ? "bg-rose-100 text-rose-700"
                          : r.level === "low" ? "bg-amber-100 text-amber-700"
                          : r.level === "unknown" ? "bg-slate-100 text-slate-500"
                          : "bg-emerald-100 text-emerald-700",
                      ].join(" ")}>
                        {r.stock === null ? "—" : r.stock}
                        {r.level === "out" && " · Out"}
                        {r.level === "low" && " · Low"}
                      </span>
                    </td>
                    <td className="py-3 pr-4" onClick={(e) => e.stopPropagation()}>
                      {r.hasVariants ? (
                        /* Variant product: toggle expand */
                        <button
                          onClick={() => toggleExpanded(r.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        >
                          Edit sizes
                          {expandedIds.has(r.id) ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      ) : (
                        /* Simple product: inline input */
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={editStockById[r.id] ?? ""}
                            onChange={(e) =>
                              setEditStockById((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
                            placeholder="qty"
                          />
                          <button
                            onClick={() => handleSaveStock(r)}
                            disabled={savingStockId === r.id}
                            className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                          >
                            {savingStockId === r.id ? "Saving…" : "Save"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Variant expansion row */}
                  {r.hasVariants && expandedIds.has(r.id) && r.size_variants && (
                    <tr key={`${r.id}-expand`} className="bg-slate-50 border-b border-slate-100">
                      <td colSpan={5} className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                          Per-size stock for {r.name}
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {r.size_variants.map((sv) => (
                            <div key={sv.id} className="flex flex-col gap-1 min-w-[90px]">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-slate-700">{sv.label}</span>
                                {sv.stock <= 0 && (
                                  <span className="text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1 rounded">OOS</span>
                                )}
                                {sv.stock > 0 && sv.stock <= 5 && (
                                  <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1 rounded">Low</span>
                                )}
                              </div>
                              <input
                                type="number"
                                min={0}
                                step={1}
                                value={editSizeStock[`${r.id}:${sv.id}`] ?? sv.stock}
                                onChange={(e) =>
                                  setEditSizeStock((prev) => ({
                                    ...prev,
                                    [`${r.id}:${sv.id}`]: e.target.value,
                                  }))
                                }
                                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-center font-semibold"
                              />
                              <div className="text-[10px] text-slate-400 text-center">was {sv.stock}</div>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => handleSaveVariantStock(r)}
                          disabled={savingVariantId === r.id}
                          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-60 transition"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {savingVariantId === r.id ? "Saving…" : "Save all sizes"}
                        </button>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ── MOBILE CARDS (< md) ──────────────────────────────────────────── */}
      <section className="md:hidden space-y-3 px-0">
        {loading ? (
          <div className="glass glass-ring rounded-[20px] p-4 text-sm text-slate-700">
            Loading stock...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="glass glass-ring rounded-[20px] p-4 text-sm text-slate-600">
            No products match this filter.
          </div>
        ) : (
          filteredRows.map((r) => (
            <div
              key={r.id}
              className="glass glass-ring rounded-[20px] p-4 space-y-3"
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => router.push(`/products/${r.id}`)}
                    className="text-sm font-bold text-slate-900 text-left leading-tight hover:underline"
                  >
                    {r.name}
                  </button>
                  <div className="text-xs text-slate-500 mt-0.5">{r.sellerName}</div>
                </div>
                <span className={[
                  "flex-shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold",
                  r.level === "out" ? "bg-rose-100 text-rose-700"
                    : r.level === "low" ? "bg-amber-100 text-amber-700"
                    : r.level === "unknown" ? "bg-slate-100 text-slate-500"
                    : "bg-emerald-100 text-emerald-700",
                ].join(" ")}>
                  {r.stock === null ? "—" : `${r.stock} left`}
                </span>
              </div>

              {/* Status pill */}
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                  {r.status}
                </span>
                {r.hasVariants && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium border border-blue-100">
                    {r.size_variants?.length} sizes
                  </span>
                )}
              </div>

              {/* Edit area */}
              {r.hasVariants && r.size_variants ? (
                <div>
                  <button
                    onClick={() => toggleExpanded(r.id)}
                    className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700"
                  >
                    <span>Edit per-size stock</span>
                    {expandedIds.has(r.id) ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {expandedIds.has(r.id) && (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {r.size_variants.map((sv) => (
                          <div key={sv.id} className="rounded-xl border border-slate-200 bg-white p-2.5">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-xs font-bold text-slate-700">{sv.label}</span>
                              {sv.stock <= 0 && (
                                <span className="text-[9px] font-bold text-rose-600">OOS</span>
                              )}
                              {sv.stock > 0 && sv.stock <= 5 && (
                                <span className="text-[9px] font-bold text-amber-600">Low</span>
                              )}
                            </div>
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={editSizeStock[`${r.id}:${sv.id}`] ?? sv.stock}
                              onChange={(e) =>
                                setEditSizeStock((prev) => ({
                                  ...prev,
                                  [`${r.id}:${sv.id}`]: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-center font-semibold"
                            />
                            <div className="text-[10px] text-slate-400 text-center mt-1">
                              was {sv.stock}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => handleSaveVariantStock(r)}
                        disabled={savingVariantId === r.id}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60 transition"
                      >
                        <Save className="w-4 h-4" />
                        {savingVariantId === r.id ? "Saving…" : "Save all sizes"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Simple product: inline row */
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={editStockById[r.id] ?? ""}
                    onChange={(e) =>
                      setEditStockById((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="Enter new stock qty"
                  />
                  <button
                    onClick={() => handleSaveStock(r)}
                    disabled={savingStockId === r.id}
                    className="flex-shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-60 transition"
                  >
                    {savingStockId === r.id ? "…" : "Save"}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
